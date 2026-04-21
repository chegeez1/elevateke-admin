import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CreditCard, ArrowDownToLine, ArrowUpToLine, DollarSign, Activity, Settings, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const useGetAdminStats = () => {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => customFetch<any>("/api/admin/stats"),
  });
};

const useUpdateTradeDirection = () => {
  return {
    mutate: (data: any, options: any) => {
      customFetch("/api/admin/trade/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.data),
      }).then(options.onSuccess).catch(options.onError);
    },
    isPending: false
  }
};

export default function Dashboard() {
  const { data: stats, isLoading, refetch } = useGetAdminStats();
  const updateTrade = useUpdateTradeDirection();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!stats) return <div className="p-8 text-center text-destructive">Failed to load stats.</div>;

  const handleToggleTrade = () => {
    const newDir = stats.tradeDirection === "up" ? "down" : "up";
    updateTrade.mutate({ data: { direction: newDir } }, {
      onSuccess: () => refetch()
    });
  };

  const isUp = stats.tradeDirection === "up";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Overview</h1>
          <p className="text-muted-foreground">Real-time metrics and global controls.</p>
        </div>
        <div className="flex items-center gap-4">
          <Card className={`border-2 ${isUp ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10'}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Trade Direction</div>
                <div className={`text-2xl font-bold uppercase tracking-wider ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stats.tradeDirection}
                </div>
              </div>
              <Button 
                onClick={handleToggleTrade}
                variant={isUp ? "destructive" : "default"}
                className={`font-bold ${!isUp && 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Flip to {isUp ? 'DOWN' : 'UP'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Registered accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">KSH {(stats.netRevenue || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Deposits - Withdrawals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Withdrawals</CardTitle>
            <ArrowUpToLine className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">KSH {(stats.pendingWithdrawalsAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{stats.pendingWithdrawalsCount || 0} requests awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Trades</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTradesCount?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Currently open positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deposited</CardTitle>
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KSH {(stats.totalDepositedActive || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Active platform deposits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Withdrawn</CardTitle>
            <ArrowUpToLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KSH {(stats.totalWithdrawn || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Successfully processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings Paid</CardTitle>
            <CreditCard className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">KSH {(stats.totalEarningsPaid || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Bonuses + returns + referrals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Deposits</CardTitle>
            <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{(stats.activeDeposits || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Currently earning plans</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
