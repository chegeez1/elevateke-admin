import { Layout } from "@/components/layout";
import { useGetDashboardSummary, useGetAnnouncements, useClaimLoginBonus, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Wallet, TrendingUp, Gift, Zap, Star, Users, CheckCircle, ArrowDownCircle, ArrowUpCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";

type ActivityItem = {
  id: string;
  category: "deposit" | "withdrawal" | "earning";
  subtype: string;
  amount: number;
  description: string;
  date: string;
  isCredit: boolean;
};

function useGetActivity() {
  return useQuery<ActivityItem[]>({
    queryKey: ["/api/activity"],
    queryFn: () => customFetch<ActivityItem[]>("/api/activity"),
  });
}

const activityIcon: Record<string, JSX.Element> = {
  deposit: <ArrowDownCircle size={16} className="text-green-600" />,
  withdrawal: <ArrowUpCircle size={16} className="text-red-500" />,
  login_bonus: <Gift size={16} className="text-amber-500" />,
  daily: <TrendingUp size={16} className="text-blue-500" />,
  referral: <Users size={16} className="text-purple-500" />,
  task: <CheckCircle size={16} className="text-green-500" />,
  trade: <Zap size={16} className="text-orange-500" />,
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: announcements, isLoading: loadingAnnouncements } = useGetAnnouncements();
  const { data: activity } = useGetActivity();
  const claimBonusMut = useClaimLoginBonus();
  const queryClient = useQueryClient();

  const handleClaimBonus = () => {
    claimBonusMut.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(`🎉 Claimed KSH ${res.amount}!`, { description: res.message });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      },
      onError: (err) => {
        toast.error("Failed to claim bonus", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  const getVipColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "bronze": return "bg-gray-400 text-white";
      case "silver": return "bg-slate-300 text-slate-900";
      case "gold": return "bg-amber-400 text-amber-900";
      case "platinum": return "bg-purple-500 text-white";
      default: return "bg-gray-200 text-gray-800";
    }
  };

  if (loadingSummary) return <Layout><div className="flex justify-center p-12">Loading dashboard...</div></Layout>;
  if (!summary) return <Layout><div className="text-center p-12 text-destructive">Failed to load dashboard</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500">Welcome back! Here's your overview.</p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge className={`${getVipColor(summary.vipLevel)} text-sm px-3 py-1 flex items-center gap-1`}>
              <Award size={14} /> VIP {summary.vipLevel}
            </Badge>
          </div>
        </div>

        {summary.loginBonusAvailable && (
          <Card className="bg-gradient-to-r from-primary to-emerald-600 text-white border-none shadow-lg">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-full">
                  <Gift size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Daily Login Bonus</h3>
                  <p className="text-primary-foreground/80">Claim your free daily reward now!</p>
                </div>
              </div>
              <Button onClick={handleClaimBonus} disabled={claimBonusMut.isPending} variant="secondary" className="w-full sm:w-auto">
                {claimBonusMut.isPending ? "Claiming..." : "Claim Bonus"}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Balance</p>
                  <h3 className="text-2xl font-bold mt-1">KSH {formatNumber(summary.balance)}</h3>
                </div>
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <Wallet size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Earned</p>
                  <h3 className="text-2xl font-bold mt-1 text-green-600">KSH {formatNumber(summary.totalEarned)}</h3>
                </div>
                <div className="bg-green-100 p-2 rounded-lg text-green-600">
                  <TrendingUp size={20} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Active Deposits</p>
                  <h3 className="text-2xl font-bold mt-1">{summary.activeDeposits}</h3>
                </div>
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <Wallet size={20} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Today's Earnings</p>
                  <h3 className="text-2xl font-bold mt-1 text-secondary">KSH {formatNumber(summary.todayEarned)}</h3>
                </div>
                <div className="bg-orange-100 p-2 rounded-lg text-secondary">
                  <TrendingUp size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Star size={18} className="text-amber-500" /> Recent Activity</CardTitle>
              <Link href="/transactions"><Button variant="ghost" size="sm" className="text-primary text-xs">View All</Button></Link>
            </CardHeader>
            <CardContent>
              {activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.slice(0, 6).map(item => {
                    const iconKey = item.category === "earning" ? item.subtype : item.category;
                    const icon = activityIcon[iconKey] ?? <Clock size={16} className="text-gray-500" />;
                    return (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-100 p-2 rounded-full">{icon}</div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.description}</p>
                            <p className="text-xs text-gray-400">{new Date(item.date).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className={`font-bold text-sm ${item.isCredit ? "text-green-600" : "text-red-500"}`}>
                          {item.isCredit ? "+" : "-"} KSH {formatNumber(item.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded-xl border border-dashed text-gray-500 text-sm">
                  No activity yet. Claim your daily bonus or start investing!
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Active Trade</CardTitle>
              <Link href="/trade"><Button variant="outline" size="sm">Go to Trade</Button></Link>
            </CardHeader>
            <CardContent>
              {summary.activeTrade ? (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">{summary.activeTrade.direction.toUpperCase()}</span>
                    <Badge variant={summary.activeTrade.direction === 'up' ? 'default' : 'destructive'}>
                      {summary.activeTrade.durationMins} min
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Amount: KSH {formatNumber(summary.activeTrade.amount)}</span>
                    <span>Multiplier: {summary.activeTrade.multiplier}x</span>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded-xl border border-gray-100 border-dashed text-gray-500">
                  No active trades. Place a trade to multiply your balance!
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Announcements</CardTitle>
              <Bell className="text-gray-400" size={20} />
            </CardHeader>
            <CardContent>
              {loadingAnnouncements ? (
                <div className="text-center py-4">Loading...</div>
              ) : announcements && announcements.length > 0 ? (
                <div className="space-y-4">
                  {announcements.slice(0, 3).map(ann => (
                    <div key={ann.id} className="pb-4 border-b last:border-0 last:pb-0">
                      <h4 className="font-semibold text-gray-900">{ann.title}</h4>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{ann.content}</p>
                      <span className="text-xs text-gray-400 mt-2 block">{new Date(ann.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 text-gray-500">
                  No announcements at this time.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
