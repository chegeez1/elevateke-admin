import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetEarnings, useClaimDailyEarnings, useReinvestEarnings, useGetDashboardSummary, type ErrorType, type ErrorResponse } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { History, Coins, ArrowRightLeft, Clock, CheckCircle2, TrendingUp, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function MidnightCountdown({ nextEarningAt }: { nextEarningAt: string }) {
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const update = () => {
      const target = new Date(nextEarningAt).getTime();
      const now = Date.now();
      const ms = target - now;
      if (ms <= 0) { setLabel("Ready now!"); setPct(100); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
      const dayMs = 24 * 60 * 60 * 1000;
      setPct(Math.round(((dayMs - ms) / dayMs) * 100));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [nextEarningAt]);

  return { label, pct };
}

function CountdownCard({ nextEarningAt, dailyRate }: { nextEarningAt: string; dailyRate: number }) {
  const { label, pct } = MidnightCountdown({ nextEarningAt });

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 size={18} className="text-amber-600" />
          <p className="font-semibold text-amber-800">Next Claim Available Tomorrow</p>
        </div>
        <p className="text-sm text-amber-700 mb-4">
          Today's earnings have been settled. Your next KSH {formatNumber(dailyRate)}/day return will be claimable at midnight.
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-amber-700">
            <span className="flex items-center gap-1"><Clock size={12} /> Next claim in</span>
            <span className="font-mono font-bold">{label}</span>
          </div>
          <Progress value={pct} className="h-2 bg-amber-100 [&>div]:bg-amber-500" />
          <p className="text-xs text-amber-600 text-right">
            Resets midnight · {new Date(nextEarningAt).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Earnings() {
  const { data: earnings, isLoading } = useGetEarnings();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const claimMut = useClaimDailyEarnings();
  const reinvestMut = useReinvestEarnings();
  const queryClient = useQueryClient();

  const [reinvestOpen, setReinvestOpen] = useState(false);
  const [reinvestAmount, setReinvestAmount] = useState("");

  const canClaim = summary?.canClaimEarnings === true;
  const claimableAmount = summary?.claimableEarningsTotal ?? 0;
  const dailyRate = summary?.dailyEarningsTotal ?? 0;
  const nextEarningAt: string | null = summary?.nextEarningAt ?? null;
  const hasActiveDeposit = (summary?.activeDeposits ?? 0) > 0;

  const handleClaim = () => {
    claimMut.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(`Claimed KSH ${formatNumber(res.amount)}!`, { description: res.message });
        queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
      onError: (err: ErrorType<ErrorResponse>) => {
        toast.error("Failed to claim", { description: err.data?.error ?? "No earnings available." });
      }
    });
  };

  const handleReinvest = (e: React.FormEvent) => {
    e.preventDefault();
    reinvestMut.mutate({ data: { amount: Number(reinvestAmount) } }, {
      onSuccess: (res) => {
        toast.success("Successfully reinvested!", { description: res.message });
        setReinvestOpen(false);
        setReinvestAmount("");
        queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
      onError: () => {
        toast.error("Reinvestment failed", { description: "Please check your balance and try again." });
      }
    });
  };

  const getEarningColor = (type: string) => {
    switch (type) {
      case 'daily': return 'bg-blue-100 text-blue-800';
      case 'referral': return 'bg-purple-100 text-purple-800';
      case 'task': return 'bg-green-100 text-green-800';
      case 'login_bonus': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getEarningLabel = (type: string) => {
    switch (type) {
      case 'daily': return 'Daily Return';
      case 'referral': return 'Referral';
      case 'task': return 'Task';
      case 'login_bonus': return 'Login Bonus';
      default: return type;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Earnings</h1>
          <p className="text-gray-500">Track and manage your daily investment returns.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center p-4">
            <Wallet size={20} className="text-primary mx-auto mb-1" />
            <div className="text-xs text-gray-500 mb-1">Balance</div>
            <div className="font-bold text-lg">KSH {formatNumber(summary?.balance ?? 0)}</div>
          </Card>
          <Card className="text-center p-4">
            <TrendingUp size={20} className="text-green-600 mx-auto mb-1" />
            <div className="text-xs text-gray-500 mb-1">Total Earned</div>
            <div className="font-bold text-lg text-green-600">KSH {formatNumber(summary?.totalEarned ?? 0)}</div>
          </Card>
          <Card className="text-center p-4">
            <Coins size={20} className="text-blue-600 mx-auto mb-1" />
            <div className="text-xs text-gray-500 mb-1">Today's Earnings</div>
            <div className="font-bold text-lg text-blue-600">KSH {formatNumber(summary?.todayEarned ?? 0)}</div>
          </Card>
          <Card className="text-center p-4">
            <History size={20} className="text-purple-600 mx-auto mb-1" />
            <div className="text-xs text-gray-500 mb-1">Daily Rate</div>
            <div className="font-bold text-lg text-purple-600">KSH {formatNumber(dailyRate)}/day</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Claim Card */}
          {summaryLoading ? (
            <Card><CardContent className="p-6 text-center text-gray-400">Loading...</CardContent></Card>
          ) : !hasActiveDeposit ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-6 text-center text-gray-500">
                <Coins size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium mb-1">No Active Investment</p>
                <p className="text-sm">Make a deposit to start earning daily returns.</p>
                <Button className="mt-4" onClick={() => window.location.href = "/deposit"}>Go to Deposit</Button>
              </CardContent>
            </Card>
          ) : canClaim ? (
            <Card className="border-green-300 bg-gradient-to-br from-green-50 to-emerald-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Coins size={18} className="text-green-600" />
                  <p className="font-semibold text-green-800">Daily Earnings Ready!</p>
                </div>
                <p className="text-sm text-green-700 mb-2">Your investment has generated today's return.</p>
                <div className="bg-white/60 rounded-lg p-3 mb-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Ready to Claim</div>
                  <div className="text-3xl font-bold text-green-700">KSH {formatNumber(claimableAmount)}</div>
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                  onClick={handleClaim}
                  disabled={claimMut.isPending}
                >
                  {claimMut.isPending ? "Claiming..." : `Claim KSH ${formatNumber(claimableAmount)}`}
                </Button>
              </CardContent>
            </Card>
          ) : nextEarningAt ? (
            <CountdownCard nextEarningAt={nextEarningAt} dailyRate={dailyRate} />
          ) : null}

          {/* Reinvest Card */}
          <Card>
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div>
                <p className="text-gray-700 font-semibold flex items-center gap-2 mb-2">
                  <ArrowRightLeft size={18} /> Reinvest Balance
                </p>
                <p className="text-sm text-gray-500 mb-3">
                  Compound your wealth by turning your available balance back into an active deposit.
                </p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  Available: <strong className="text-primary">KSH {formatNumber(summary?.balance ?? 0)}</strong>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4" onClick={() => setReinvestOpen(true)} disabled={!summary?.balance || summary.balance <= 0}>
                Reinvest Balance
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Earnings History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History size={20} /> Earnings History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">Loading history...</div>
            ) : earnings && earnings.length > 0 ? (
              <div className="space-y-3">
                {earnings.map(e => (
                  <div key={e.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-gray-900">{e.description}</span>
                      <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="font-bold text-green-600">+ KSH {formatNumber(e.amount)}</span>
                      <Badge variant="secondary" className={`${getEarningColor(e.type)} border-none text-[10px]`}>
                        {getEarningLabel(e.type)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed text-gray-500">
                <History size={32} className="mx-auto mb-3 text-gray-300" />
                No earnings yet. Invest in a plan or complete tasks to start earning!
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reinvest Dialog */}
        <Dialog open={reinvestOpen} onOpenChange={setReinvestOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reinvest Earnings</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleReinvest} className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-md text-sm">
                Available Balance: <strong className="text-primary">KSH {formatNumber(summary?.balance || 0)}</strong>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reinvestAmount">Amount to Reinvest (KSH)</Label>
                <Input
                  id="reinvestAmount"
                  type="number"
                  min="100"
                  max={summary?.balance}
                  value={reinvestAmount}
                  onChange={e => setReinvestAmount(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReinvestOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={reinvestMut.isPending}>
                  {reinvestMut.isPending ? "Processing..." : "Reinvest"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
