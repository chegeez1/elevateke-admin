import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import {
  useGetPlans,
  useCreateDeposit,
  useVerifyDeposit,
  useGetDeposits,
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
import { ExternalLink, AlertTriangle, Clock, RefreshCw, XCircle, TrendingUp, CalendarDays, Zap, CheckCircle2 } from "lucide-react";
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

        {totalDays && totalDays > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Day {elapsedDays} of {totalDays}</span>
              <span>{Math.round(progressPct)}% complete</span>
            </div>
            <Progress value={progressPct} className="h-2 bg-green-100 [&>div]:bg-green-500" />
            <div className="flex justify-between text-xs text-gray-400">
              <span>{deposit.startsAt ? new Date(deposit.startsAt).toLocaleDateString() : "—"}</span>
              <span>{deposit.endsAt ? new Date(deposit.endsAt).toLocaleDateString() : "—"}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Deposit() {
  const { data: plans, isLoading: loadingPlans } = useGetPlans();
  const { data: depositsRaw, isLoading: loadingDeposits } = useGetDeposits();
  const deposits = depositsRaw as DepositItem[] | undefined;

  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentStep, setPaymentStep] = useState<"form" | "paystack" | "success">("form");
  const [currentReference, setCurrentReference] = useState("");
  const [currentAuthUrl, setCurrentAuthUrl] = useState("");
  const [currentDepositId, setCurrentDepositId] = useState<number | null>(null);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [depositExpiresAt, setDepositExpiresAt] = useState<string | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  const createDepositMut = useCreateDeposit();
  const verifyDepositMut = useVerifyDeposit();
  const queryClient = useQueryClient();

  const cancelDepositMut = useMutation({
    mutationFn: (depositId: number) =>
      customFetch(`/api/deposits/${depositId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Deposit cancelled");
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
    },
    onError: () => toast.error("Failed to cancel deposit"),
  });

  useEffect(() => {
    if (paymentStep !== "paystack" || !currentDepositId || isExpired) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
    }, 5000);
    return () => clearInterval(interval);
  }, [paymentStep, currentDepositId, isExpired, queryClient]);

  useEffect(() => {
    if (paymentStep !== "paystack" || !currentDepositId || !deposits) return;
    const target = deposits.find(d => d.id === currentDepositId);
    if (target?.status === "active") {
      toast.success("Deposit confirmed! Your plan is now active.");
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      setPaymentStep("success");
      autoCloseTimerRef.current = setTimeout(() => {
        resetDialog();
      }, 3500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposits, currentDepositId, paymentStep]);

  const resetDialog = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setSelectedPlan(null);
    setPaymentStep("form");
    setCurrentReference("");
    setCurrentAuthUrl("");
    setCurrentDepositId(null);
    setVerifyAttempts(0);
    setVerifyError(null);
    setIsExpired(false);
    setDepositExpiresAt(null);
  };

  const handleInitiateDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    createDepositMut.mutate({ data: { planId: selectedPlan, amount: Number(amount), phone } }, {
      onSuccess: (res) => {
        setCurrentReference(res.reference);
        setCurrentAuthUrl(res.paystackAuthUrl);
        const dep = res.deposit as (typeof res.deposit & { expiresAt?: string | null }) | undefined;
        setDepositExpiresAt(dep?.expiresAt ?? null);
        if (dep?.id !== undefined) {
          setCurrentDepositId(dep.id);
        } else {
          console.warn("Deposit response missing id — auto-confirm polling disabled for this session.");
        }
        setVerifyAttempts(0);
        setVerifyError(null);
        setIsExpired(false);
        setPaymentStep("paystack");
      },
      onError: (err: ErrorType<ErrorResponse>) => {
        toast.error("Failed to initiate deposit", { description: err.data?.error ?? "Unknown error" });
      },
    });
  };

  const handleVerify = () => {
    setVerifyError(null);
    verifyDepositMut.mutate({ data: { reference: currentReference } }, {
      onSuccess: () => {
        toast.success("Deposit verified! Your plan is now active.");
        queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
        resetDialog();
      },
      onError: (err: VerifyError) => {
        setVerifyAttempts(a => a + 1);
        if (err.data?.expired) {
          setIsExpired(true);
        }
        setVerifyError(err.data?.error ?? "Payment not yet received. Please try again.");
      },
    });
  };

  const activePlans = deposits?.filter(d => d.status === "active") ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Deposit</h1>
          <p className="text-gray-500">Invest in a plan to earn daily returns.</p>
        </div>

        {activePlans.length > 0 && (
          <div className="space-y-3">
            {activePlans.map(dep => (
              <CurrentPlanCard key={dep.id} deposit={dep} />
            ))}
          </div>
        )}

        <Tabs defaultValue="plans">
          <TabsList className="mb-4">
            <TabsTrigger value="plans">Deposit Plans</TabsTrigger>
            <TabsTrigger value="history">My Deposits</TabsTrigger>
          </TabsList>

          <TabsContent value="plans">
            {loadingPlans ? (
              <div className="text-center p-8">Loading plans...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans?.map(plan => (
                  <Card key={plan.id} className="flex flex-col relative overflow-hidden border-2 hover:border-primary transition-colors">
                    {plan.bonusPercent > 0 && (
                      <div className="absolute top-0 right-0 bg-secondary text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                        {plan.bonusPercent}% Bonus
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <p className="text-gray-500 text-sm">{plan.description}</p>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div className="flex justify-between pb-2 border-b">
                        <span className="text-gray-500">Daily Rate</span>
                        <span className="font-bold text-green-600">{(plan.dailyRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between pb-2 border-b">
                        <span className="text-gray-500">Duration</span>
                        <span className="font-bold">{plan.durationDays} Days</span>
                      </div>
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
                      {/* Earnings example at minimum investment */}
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-1">
                        <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Example at min. investment</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Daily earn</span>
                          <span className="font-bold text-green-700">KSH {formatNumber(Math.round(plan.minAmount * plan.dailyRate))}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Total return</span>
                          <span className="font-bold text-green-700">KSH {formatNumber(Math.round(plan.minAmount * plan.dailyRate * plan.durationDays))}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" onClick={() => {
                        setSelectedPlan(plan.id);
                        setAmount(plan.minAmount.toString());
                        setPaymentStep("form");
                      }}>
                        Invest Now
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle>Deposit History</CardTitle></CardHeader>
              <CardContent>
                {loadingDeposits ? (
                  <div className="text-center p-4">Loading...</div>
                ) : deposits && deposits.length > 0 ? (
                  <div className="space-y-4">
                    {deposits.map(dep => (
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
                          {dep.status === "pending" && (
                            <div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-7 px-2"
                                disabled={cancelDepositMut.isPending}
                                onClick={() => cancelDepositMut.mutate(dep.id)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 text-gray-500">No deposits found.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedPlan} onOpenChange={(open) => !open && resetDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deposit via M-Pesa</DialogTitle>
              <DialogDescription>
                {paymentStep === "form"
                  ? "Enter amount and M-Pesa phone number to proceed."
                  : paymentStep === "success"
                  ? "Your deposit has been activated."
                  : "Complete payment on your phone — we'll confirm it automatically."}
              </DialogDescription>
            </DialogHeader>

            {paymentStep === "form" ? (
              <form onSubmit={handleInitiateDeposit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (KSH)</Label>
                  <Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">M-Pesa Phone Number</Label>
                  <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="e.g. 0712345678" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetDialog}>Cancel</Button>
                  <Button type="submit" disabled={createDepositMut.isPending}>
                    {createDepositMut.isPending ? "Processing..." : "Proceed to Payment"}
                  </Button>
                </DialogFooter>
              </form>
            ) : paymentStep === "success" ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle2 size={56} className="text-green-500" />
                <div>
                  <p className="text-lg font-semibold text-green-800">Payment Confirmed!</p>
                  <p className="text-sm text-gray-500 mt-1">
                    KSH {formatNumber(Number(amount))} is now active. You will start earning daily returns.
                  </p>
                </div>
                <p className="text-xs text-gray-400">This dialog will close automatically…</p>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {depositExpiresAt && !isExpired && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Clock size={14} />
                    <span>Payment window: <ExpiryCountdown expiresAt={depositExpiresAt} /></span>
                  </div>
                )}

                {verifyError && (
                  <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${isExpired ? "bg-red-50 border-red-200 text-red-700" : "bg-orange-50 border-orange-200 text-orange-700"}`}>
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{verifyError}</span>
                  </div>
                )}

                {!isExpired && (
                  <>
                    <div className="text-center">
                      <Button className="w-full" size="lg" asChild>
                        <a href={currentAuthUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                          Pay KSH {formatNumber(Number(amount))} on M-Pesa <ExternalLink size={16} />
                        </a>
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <RefreshCw size={14} className="animate-spin shrink-0" />
                      <span>Waiting for payment confirmation — this will update automatically.</span>
                    </div>

                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-400 mb-2 text-center">
                        Payment not updating? You can check manually:
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
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
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-gray-700 text-xs"
                    onClick={resetDialog}
                  >
                    {isExpired ? "Start New Deposit" : "Cancel & Start Over"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
