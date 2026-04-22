import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Ban, CheckCircle, Wallet, AlertTriangle, TrendingUp, X, Clock, Bell,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface UserDeposit {
  id: number;
  planName: string;
  amount: number;
  dailyEarning: number;
  status: string;
  paystackRef: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

const DEPOSIT_BADGE: Record<string, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "text-amber-600 bg-amber-50 border-amber-200" },
  active:    { label: "Active",    className: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  completed: { label: "Completed", className: "text-blue-600 bg-blue-50 border-blue-200" },
  cancelled: { label: "Cancelled", className: "text-rose-600 bg-rose-50 border-rose-200" },
  expired:   { label: "Expired",   className: "text-gray-600 bg-gray-100 border-gray-300" },
  failed:    { label: "Failed",    className: "text-red-700 bg-red-50 border-red-300" },
};

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [cancelDeposit, setCancelDeposit] = useState<UserDeposit | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => customFetch<any>(`/api/admin/users/${id}`),
  });

  const adjustBalance = useMutation({
    mutationFn: (data: { amount: number, note: string }) => 
      customFetch(`/api/admin/users/${id}/adjust-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
      setIsAdjustOpen(false);
      setBalanceAmount("");
      setBalanceNote("");
      toast({ title: "Balance adjusted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to adjust balance", description: err.message, variant: "destructive" });
    }
  });

  const toggleSuspend = useMutation({
    mutationFn: (suspend: boolean) => 
      customFetch(`/api/admin/users/${id}/${suspend ? 'suspend' : 'unsuspend'}`, { method: "POST" }),
    onSuccess: (_, suspend) => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
      toast({ title: `User ${suspend ? 'suspended' : 'unsuspended'}` });
    }
  });

  const cancelDepositMut = useMutation({
    mutationFn: (depositId: number) =>
      customFetch(`/api/admin/deposits/${depositId}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      setCancelDeposit(null);
      toast({ title: "Deposit cancelled", description: "The deposit has been cancelled and the user notified." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to cancel deposit", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading user details...</div>;
  if (!detail || !detail.user) return <div className="p-8 text-center text-destructive">User not found.</div>;

  const user = detail.user;
  const deposits: UserDeposit[] = detail.deposits ?? [];

  const pendingDeposits = deposits.filter(d => d.status === "pending");
  const activeDeposits  = deposits.filter(d => d.status === "active");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/users">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{user.name}</h1>
          <p className="text-muted-foreground">{user.email} • {user.phone}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button 
            variant={user.isSuspended ? "default" : "destructive"}
            onClick={() => toggleSuspend.mutate(!user.isSuspended)}
            disabled={toggleSuspend.isPending}
          >
            {user.isSuspended ? <CheckCircle className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
            {user.isSuspended ? "Unsuspend User" : "Suspend User"}
          </Button>
        </div>
      </div>

      {/* Pending deposit alert */}
      {pendingDeposits.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This user has <strong>{pendingDeposits.length} pending payment{pendingDeposits.length !== 1 ? "s" : ""}</strong> awaiting M-Pesa confirmation.
            You can cancel them below if payment was not received.
          </span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Account Status</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Current Balance</div>
                <div className="text-2xl font-bold">KSH {user.balance?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Deposited</div>
                <div className="text-xl font-semibold">KSH {user.totalDeposited?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Earned</div>
                <div className="text-xl font-semibold">KSH {user.totalEarned?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">VIP Level</div>
                <div className="text-xl font-semibold font-mono">{user.vipLevel}</div>
              </div>
              <div className="col-span-2">
                <div className="text-sm font-medium text-muted-foreground">Deposit Reminder</div>
                {user.depositReminderSentAt ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 gap-1">
                      <Bell className="h-3 w-3" /> Reminder sent
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(user.depositReminderSentAt).toLocaleString("en-KE")}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground mt-1">No reminder sent</div>
                )}
              </div>
            </div>

            <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
              <DialogTrigger asChild>
                <Button className="w-full mt-4" variant="outline">
                  <Wallet className="mr-2 h-4 w-4" />
                  Adjust Balance manually
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adjust User Balance</DialogTitle>
                  <DialogDescription>
                    Add or deduct funds directly from the user's account. Use negative numbers to deduct.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (KSH)</label>
                    <Input 
                      type="number" 
                      placeholder="e.g. 5000 or -1000"
                      value={balanceAmount}
                      onChange={(e) => setBalanceAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reason Note</label>
                    <Input 
                      placeholder="Reason for adjustment"
                      value={balanceNote}
                      onChange={(e) => setBalanceNote(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAdjustOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={() => adjustBalance.mutate({ amount: Number(balanceAmount), note: balanceNote })}
                    disabled={!balanceAmount || isNaN(Number(balanceAmount)) || adjustBalance.isPending}
                  >
                    Confirm Adjustment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Deposits summary card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Deposits</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {deposits.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No deposits found.</div>
            ) : (
              <div className="space-y-3">
                {/* Summary line */}
                <div className="flex gap-4 text-sm text-muted-foreground border-b pb-3">
                  <span><strong className="text-foreground">{activeDeposits.length}</strong> active</span>
                  <span><strong className="text-foreground">{pendingDeposits.length}</strong> pending</span>
                  <span><strong className="text-foreground">{deposits.length}</strong> total</span>
                </div>

                {deposits.map(dep => {
                  const badge = DEPOSIT_BADGE[dep.status] ?? { label: dep.status, className: "" };
                  return (
                    <div key={dep.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{dep.planName}</span>
                          <Badge variant="outline" className={`text-xs shrink-0 ${badge.className}`}>{badge.label}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          KSH {dep.amount.toLocaleString("en-KE")} · KSH {dep.dailyEarning.toLocaleString("en-KE")}/day
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(dep.createdAt).toLocaleDateString("en-KE")}
                          {dep.paystackRef && dep.paystackRef.startsWith("reinvest") && (
                            <span className="ml-1 text-blue-500">(reinvested)</span>
                          )}
                        </div>
                      </div>
                      {dep.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 shrink-0 h-7 px-2 text-xs"
                          onClick={() => setCancelDeposit(dep)}
                        >
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel deposit confirm dialog */}
      <Dialog open={!!cancelDeposit} onOpenChange={open => !open && setCancelDeposit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Cancel Pending Deposit
            </DialogTitle>
            <DialogDescription>
              Cancel <strong>{cancelDeposit?.planName}</strong> deposit of{" "}
              <strong>KSH {cancelDeposit?.amount?.toLocaleString("en-KE")}</strong>?
              <br /><br />
              The user will be notified via inbox. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDeposit(null)}>Keep It</Button>
            <Button
              variant="destructive"
              onClick={() => cancelDeposit && cancelDepositMut.mutate(cancelDeposit.id)}
              disabled={cancelDepositMut.isPending}
            >
              Yes, Cancel It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
