import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, CreditCard, ArrowDownToLine, ArrowUpToLine, DollarSign, Activity, RefreshCw, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const useGetAdminStats = () => {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => customFetch<any>("/api/admin/stats"),
  });
};

const useGetReminderStats = () => {
  return useQuery({
    queryKey: ["admin-reminder-stats"],
    retry: 1,
    queryFn: () => customFetch<{
      reminder1: { sent: number; converted: number; conversionRate: number; medianHoursToDeposit: number | null };
      reminder2: { sent: number; converted: number; conversionRate: number; medianHoursToDeposit: number | null };
      reminder3: { sent: number; converted: number; conversionRate: number; medianHoursToDeposit: number | null };
    }>("/api/admin/reminder-stats"),
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
  const { data: reminderStats, isError: reminderError } = useGetReminderStats();
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

  const formatMedian = (hours: number | null | undefined) => {
    if (hours == null) return "—";
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const reminderRows = [
    { label: "Reminder 1", sublabel: "24h after signup", data: reminderStats?.reminder1, color: "blue" },
    { label: "Reminder 2", sublabel: "3 days after signup", data: reminderStats?.reminder2, color: "amber" },
    { label: "Reminder 3", sublabel: "7 days — final nudge", data: reminderStats?.reminder3, color: "rose" },
  ] as const;

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Reminder Campaign Performance
            </CardTitle>
            <CardDescription className="mt-1">How many non-depositing users converted after each automated nudge</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {reminderError ? (
            <p className="text-sm text-destructive">Failed to load reminder stats. Please refresh the page.</p>
          ) : !reminderStats ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {reminderRows.map(({ label, sublabel, data }) => {
                const rate = data?.conversionRate ?? 0;
                const colorClass =
                  rate >= 20 ? "text-emerald-600" :
                  rate >= 10 ? "text-amber-600" :
                  "text-rose-600";
                const barColor =
                  rate >= 20 ? "bg-emerald-500" :
                  rate >= 10 ? "bg-amber-500" :
                  "bg-rose-500";
                return (
                  <div key={label} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{sublabel}</p>
                      </div>
                      {data && data.sent > 0 ? (
                        <Badge variant="outline" className={`${colorClass} border-current font-bold text-base px-3 py-1`}>
                          {rate}%
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">No data</Badge>
                      )}
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(rate, 100)}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{(data?.sent ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Sent</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{(data?.converted ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Deposited</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-primary">{formatMedian(data?.medianHoursToDeposit)}</p>
                        <p className="text-xs text-muted-foreground">Median time</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
