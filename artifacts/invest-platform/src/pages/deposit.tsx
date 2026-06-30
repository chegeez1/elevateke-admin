import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import {
  useGetPlans,
  useCreateDeposit,
  useVerifyDeposit,
  useGetDeposits,
  useGetMe,
  customFetch,
  type ErrorType,
} from "@workspace/api-client-react";
import type { ErrorResponse } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, AlertTriangle, Clock, RefreshCw, XCircle, TrendingUp, CalendarDays, Zap, CheckCircle2, Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type ApiErrorData = { error: string; expired?: boolean; retryable?: boolean };
type VerifyError = ErrorType<ApiErrorData>;

type DepositItem = {
  id: number;
  planId: number;
  planName: string;
  amount: number;
  bonusAmount: number;
  dailyEarning: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  expiresAt?: string | null;
};

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining("Expired"); return; }
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setRemaining(`${mins}m ${secs.toString().padStart(2, "0")}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const isUrgent = new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
  return (
    <span className={`text-xs font-medium ${isUrgent ? "text-red-500" : "text-amber-600"}`}>
      <Clock size={12} className="inline mr-1" />Expires in {remaining}
    </span>
  );
}

const statusBadge = (status: string) => {
  switch (status) {
    case "active": return <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
    case "pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>;
    case "expired": return <Badge className="bg-red-100 text-red-700 border-red-200">Expired</Badge>;
    case "cancelled": return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Cancelled</Badge>;
    case "completed": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Completed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

function CurrentPlanCard({ deposit }: { deposit: DepositItem }) {
  const start = deposit.startsAt ? new Date(deposit.startsAt).getTime() : new Date(deposit.createdAt).getTime();
  const end = deposit.endsAt ? new Date(deposit.endsAt).getTime() : null;
  const now = Date.now();

  const totalDays = end ? Math.round((end - start) / 86400000) : null;
  const elapsedDays = Math.max(0, Math.floor((now - start) / 86400000));
  const remainingDays = end ? Math.max(0, Math.ceil((end - now) / 86400000)) : null;
  const progressPct = (totalDays && totalDays > 0) ? Math.min(100, (elapsedDays / totalDays) * 100) : 0;
  const dailyRatePct = deposit.amount > 0 ? ((deposit.dailyEarning / deposit.amount) * 100).toFixed(1) : "0.0";

  return (
    <Card className="border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 relative overflow-hidden">
      <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
        <Zap size={11} /> Active Plan
      </div>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-green-800">{deposit.planName}</CardTitle>
        <p className="text-sm text-green-600 font-medium">KSH {formatNumber(deposit.amount)} invested</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/70 rounded-lg p-3 text-center">
            <TrendingUp size={16} className="text-green-600 mx-auto mb-1" />
            <div className="text-xs text-gray-500">Daily Earn</div>
            <div className="font-bold text-green-700">KSH {formatNumber(deposit.dailyEarning)}</div>
            <div className="text-xs text-gray-400">{dailyRatePct}% / day</div>
          </div>
          <div className="bg-white/70 rounded-lg p-3 text-center">
            <CalendarDays size={16} className="text-green-600 mx-auto mb-1" />
            <div className="text-xs text-gray-500">Days Left</div>
            <div className="font-bold text-green-700">{remainingDays ?? "—"}</div>
            <div className="text-xs text-gray-400">of {totalDays ?? "?"} total</div>
          </div>
          <div className="bg-white/70 rounded-lg p-3 text-center">
            <Zap size={16} className="text-amber-500 mx-auto mb-1" />
            <div className="text-xs text-gray-500">Signup Bonus</div>
            <div className="font-bold text-amber-600">KSH {formatNumber(deposit.bonusAmount)}</div>
            <div className="text-xs text-gray-400">credited</div>
          </div>
        </div>
        {totalDays && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Day {elapsedDays}</span>
              <span>{progressPct.toFixed(0)}% complete</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Deposit() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: plans, isLoading: loadingPlans } = useGetPlans();
  const { data: deposits, isLoading: loadingDeposits } = useGetDeposits();
  const createDepositMut = useCreateDeposit();
  const verifyDepositMut = useVerifyDeposit();

  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [amount, setAmount] = useState("");

  const [paymentStep, setPaymentStep] = useState<"form" | "paystack" | "success">("form");
  const [currentDepositRef, setCurrentDepositRef] = useState<string | null>(null);
  const [currentDepositId, setCurrentDepositId] = useState<number | null>(null);
  const [currentAuthUrl, setCurrentAuthUrl] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const selectedPlanData = plans?.find((p) => p.id === selectedPlan);
  const isFixedAmount = selectedPlanData && selectedPlanData.fixedAmount != null;

  // Auto-poll verify for pending deposit
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paymentStep !== "paystack" || !currentDepositRef) return;
    pollRef.current = setInterval(() => {
      if (!currentDepositId || !deposits) return;
      const found = (deposits as DepositItem[]).find((d) => d.id === currentDepositId);
      if (found?.status === "active") {
        clearInterval(pollRef.current!);
        toast.success("Deposit confirmed! Your plan is now active.");
        setPaymentStep("success");
        queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [paymentStep, currentDepositRef, currentDepositId, deposits]);

  const handleVerify = () => {
    if (!currentDepositRef) return;
    verifyDepositMut.mutate(
      { data: { reference: currentDepositRef } },
      {
        onSuccess: (res) => {
          if (res.status === "active") {
            toast.success("Deposit verified! Your plan is now active.");
            setPaymentStep("success");
            queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
          } else {
            toast.info("Payment not confirmed yet. Please complete the M-Pesa prompt.");
          }
        },
        onError: (err: VerifyError) => {
          const data = err.data as ApiErrorData | undefined;
          if (data?.expired) {
            setIsExpired(true);
            toast.error("Deposit expired. Please start a new deposit.");
          } else if (data?.retryable) {
            toast.info(data.error ?? "Payment not confirmed yet.");
          } else {
            toast.error("Verification failed", { description: data?.error ?? "Please try again." });
          }
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) { toast.error("Please select a plan."); return; }
    const depositAmount = isFixedAmount ? selectedPlanData!.fixedAmount! : Number(amount);
    if (!depositAmount || depositAmount <= 0) { toast.error("Enter a valid amount."); return; }
    createDepositMut.mutate(
      { data: { planId: selectedPlan, amount: depositAmount } },
      {
        onSuccess: (res: any) => {
          setCurrentDepositRef(res.reference ?? res.paystackRef);
          setCurrentDepositId(res.id);
          setCurrentAuthUrl(res.paystackAuthUrl ?? null);
          setIsExpired(false);
          setPaymentStep("paystack");
          queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
        },
        onError: (err: ErrorType<ErrorResponse>) => {
          const data = err.data as { error?: string } | undefined;
          toast.error("Deposit failed", { description: data?.error ?? "Please try again." });
        },
      },
    );
  };

  const resetDialog = () => {
    setPaymentStep("form");
    setCurrentDepositRef(null);
    setCurrentDepositId(null);
    setCurrentAuthUrl(null);
    setIsExpired(false);
    setDialogOpen(false);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const activeDeposit = (deposits as DepositItem[] | undefined)?.find((d) => d.status === "active");

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Make a Deposit</h1>
          <p className="text-gray-500">Invest in a plan to earn daily returns.</p>
        </div>

        {activeDeposit && (
          <CurrentPlanCard deposit={activeDeposit as DepositItem} />
        )}

        <Tabs defaultValue="plans">
          <TabsList className="w-full">
            <TabsTrigger value="plans" className="flex-1">Deposit Plans</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
          </TabsList>
          <TabsContent value="plans">
            {loadingPlans ? (
              <div className="text-center p-8">Loading plans...</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {plans?.map((plan) => {
                  const effectiveAmount = plan.fixedAmount ?? plan.minAmount;
                  const dailyEarn = Math.round(effectiveAmount * plan.dailyRate);
                  const totalReturn = Math.round(dailyEarn * plan.durationDays);
                  return (
                    <Card key={plan.id} className="flex flex-col relative overflow-hidden border-2 hover:border-primary transition-colors">
                      {plan.bonusPercent > 0 && (
                        <div className="absolute top-2 right-2 bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
                          {plan.bonusPercent}% Bonus
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                        <p className="text-gray-500 text-sm">{plan.description}</p>
                      </CardHeader>
                      <CardContent className="space-y-2 flex-1">
                        {plan.fixedAmount != null ? (
                          <div className="flex justify-between pb-2 border-b">
                            <span className="text-gray-500 flex items-center gap-1"><Lock size={13} /> Fixed Deposit</span>
                            <span className="font-bold text-green-700">KSH {formatNumber(plan.fixedAmount)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between pb-2 border-b">
                              <span className="text-gray-500">Min Amount</span>
                              <span className="font-bold">KSH {formatNumber(plan.minAmount)}</span>
                            </div>
                            {plan.maxAmount && (
                              <div className="flex justify-between pb-2 border-b">
                                <span className="text-gray-500">Max Amount</span>
                                <span className="font-bold">KSH {formatNumber(plan.maxAmount)}</span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Daily Rate</span>
                          <span className="font-bold text-green-600">{(plan.dailyRate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Duration</span>
                          <span className="font-bold">{plan.durationDays} Days</span>
                        </div>
                        <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-1 mt-2">
                          <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Earnings Estimate</p>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Daily earn</span>
                            <span className="font-bold text-green-700">KSH {formatNumber(dailyEarn)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Total return</span>
                            <span className="font-bold text-green-700">KSH {formatNumber(totalReturn)}</span>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button className="w-full" onClick={() => {
                          setSelectedPlan(plan.id);
                          setAmount(plan.fixedAmount != null ? plan.fixedAmount.toString() : plan.minAmount.toString());
                          setPaymentStep("form");
                          setDialogOpen(true);
                        }}>
                          {plan.fixedAmount != null ? `Invest KSH ${formatNumber(plan.fixedAmount)}` : "Invest Now"}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle>Deposit History</CardTitle></CardHeader>
              <CardContent>
                {loadingDeposits ? (
                  <div className="text-center p-4">Loading...</div>
                ) : deposits && (deposits as DepositItem[]).length > 0 ? (
                  <div className="space-y-4">
                    {(deposits as DepositItem[]).map((dep) => (
                      <div key={dep.id} className="flex justify-between items-center p-4 border rounded-lg bg-gray-50">
                        <div className="space-y-1">
                          <div className="font-bold">{dep.planName}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(dep.createdAt).toLocaleDateString()}
                          </div>
                          {dep.status === "pending" && dep.expiresAt && (
                            <ExpiryCountdown expiresAt={dep.expiresAt} />
                          )}
                          {dep.status === "expired" && (
                            <span className="text-xs text-red-500 flex items-center gap-1">
                              <XCircle size={12} /> Payment timed out — start a new deposit
                            </span>
                          )}
                        </div>
                        <div className="text-right space-y-2">
                          <div className="font-bold">KSH {formatNumber(dep.amount)}</div>
                          {statusBadge(dep.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">No deposits yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {paymentStep === "success" ? "Deposit Successful!" : selectedPlanData?.name ?? "Deposit"}
              </DialogTitle>
              {paymentStep === "form" && (
                <DialogDescription>
                  {isFixedAmount
                    ? `Fixed investment of KSH ${formatNumber(selectedPlanData!.fixedAmount!)} via M-Pesa.`
                    : "Enter amount and M-Pesa phone number to proceed."}
                </DialogDescription>
              )}
              {paymentStep === "paystack" && (
                <DialogDescription>
                  Complete payment on your phone — we'll confirm it automatically.
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-4">
              {paymentStep === "success" && (
                <div className="text-center py-4 space-y-3">
                  <CheckCircle2 size={48} className="text-green-500 mx-auto" />
                  <p className="text-sm text-gray-600">
                    KSH {formatNumber(Number(amount))} is now active. You will start earning daily returns.
                  </p>
                  <Button className="w-full" onClick={resetDialog}>Done</Button>
                </div>
              )}

              {paymentStep === "form" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isFixedAmount ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-gray-500 mb-1">Fixed Investment Amount</p>
                      <p className="text-2xl font-bold text-green-700">KSH {formatNumber(selectedPlanData!.fixedAmount!)}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                        <Lock size={11} /> Amount is set by the plan
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount (KSH)</Label>
                      <Input
                        id="amount" type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min={selectedPlanData?.minAmount ?? 1}
                        max={selectedPlanData?.maxAmount ?? undefined}
                        required
                      />
                      {selectedPlanData && (
                        <p className="text-xs text-gray-400">
                          Min: KSH {formatNumber(selectedPlanData.minAmount)}
                          {selectedPlanData.maxAmount ? ` · Max: KSH ${formatNumber(selectedPlanData.maxAmount)}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>M-Pesa Phone Number</Label>
                    <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2">
                      <span className="flex-1 text-sm font-medium">{me?.phone ?? "—"}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Lock size={11} /> Registered number</span>
                    </div>
                    <p className="text-xs text-gray-400">To change this number, contact admin.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={createDepositMut.isPending}>
                    {createDepositMut.isPending ? "Processing…" : "Send STK Push"}
                  </Button>
                </form>
              )}

              {paymentStep === "paystack" && (
                <>
                  {isExpired && (
                    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <span>This deposit has expired. Please start a new one.</span>
                    </div>
                  )}

                  {!isExpired && (
                    <>
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center space-y-2">
                        <p className="text-sm font-semibold text-blue-800">Check your phone for an M-Pesa STK push prompt</p>
                        <p className="text-xs text-blue-600">Enter your M-Pesa PIN to complete the payment of KSH {formatNumber(Number(amount))}</p>
                      </div>

                      {currentAuthUrl && (
                        <div>
                          <Button variant="outline" className="w-full" asChild>
                            <a href={currentAuthUrl} target="_blank" rel="noopener noreferrer">
                              Open Payment Page <ExternalLink size={16} className="ml-2" />
                            </a>
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <RefreshCw size={14} className="animate-spin shrink-0" />
                        <span>Waiting for payment confirmation — this will update automatically.</span>
                      </div>

                      <div className="pt-2 border-t">
                        <p className="text-xs text-gray-400 mb-2 text-center">Payment not updating? Check manually:</p>
                        <Button
                          variant="ghost" size="sm"
                          className="w-full text-gray-500 hover:text-gray-700 text-xs h-8"
                          onClick={handleVerify}
                          disabled={verifyDepositMut.isPending}
                        >
                          {verifyDepositMut.isPending ? (
                            <><RefreshCw size={12} className="mr-1 animate-spin" />Checking...</>
                          ) : (
                            <><RefreshCw size={12} className="mr-1" />Check Payment Status</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}

                  <div className="pt-2 border-t text-center">
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="text-gray-500 hover:text-gray-700 text-xs"
                      onClick={resetDialog}
                    >
                      {isExpired ? "Start New Deposit" : "Cancel & Start Over"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
