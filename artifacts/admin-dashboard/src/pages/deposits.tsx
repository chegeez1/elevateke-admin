import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Search, TrendingUp, AlertCircle, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface AdminDeposit {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string;
  planName: string;
  amount: number;
  bonusAmount: number;
  dailyEarning: number;
  status: string;
  paystackRef: string | null;
  autoRenew: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "text-amber-600 bg-amber-50 border-amber-200" },
  active:    { label: "Active",    className: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  completed: { label: "Completed", className: "text-blue-600 bg-blue-50 border-blue-200" },
  cancelled: { label: "Cancelled", className: "text-rose-600 bg-rose-50 border-rose-200" },
  expired:   { label: "Expired",   className: "text-gray-600 bg-gray-100 border-gray-300" },
};

export default function DepositsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cancelItem, setCancelItem] = useState<AdminDeposit | null>(null);

  const { data: deposits = [], isLoading } = useQuery<AdminDeposit[]>({
    queryKey: ["admin-deposits"],
    queryFn: () => customFetch<AdminDeposit[]>("/api/admin/deposits"),
  });

  const activate = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/deposits/${id}/activate`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "Deposit activated", description: "The deposit is now active and earning daily returns." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/deposits/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setCancelItem(null);
      toast({ title: "Deposit cancelled", description: "The deposit has been cancelled and the user notified." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = deposits.filter((d) => {
    if (filter !== "all" && d.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.userName?.toLowerCase().includes(q) ||
        d.userEmail?.toLowerCase().includes(q) ||
        d.userPhone?.includes(q) ||
        d.planName?.toLowerCase().includes(q) ||
        d.paystackRef?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totals = {
    amount: filtered.reduce((s, d) => s + d.amount, 0),
    count: filtered.length,
  };

  const pendingCount  = deposits.filter(d => d.status === "pending").length;
  const expiredCount  = deposits.filter(d => d.status === "expired").length;
  const attentionCount = pendingCount + expiredCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deposits</h1>
          <p className="text-muted-foreground">View and manage all user deposits across all plans.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 border rounded-lg px-4 py-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <span className="font-medium">{totals.count} deposits</span>
          <span>·</span>
          <span className="font-medium">KSH {totals.amount.toLocaleString("en-KE")}</span>
        </div>
      </div>

      {/* Attention banner — pending + expired need action */}
      {attentionCount > 0 && (
        <div className="flex flex-wrap gap-3">
          {pendingCount > 0 && (
            <button
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
              onClick={() => setFilter("pending")}
            >
              <Clock className="h-4 w-4" />
              <span><strong>{pendingCount}</strong> pending payment{pendingCount !== 1 ? "s" : ""} awaiting confirmation</span>
            </button>
          )}
          {expiredCount > 0 && (
            <button
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 transition-colors"
              onClick={() => setFilter("expired")}
            >
              <AlertCircle className="h-4 w-4" />
              <span><strong>{expiredCount}</strong> expired deposit{expiredCount !== 1 ? "s" : ""} — payment timed out</span>
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, plan, ref..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Daily</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24">
                  Loading deposits...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                  No deposits found matching criteria.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => {
                const badge = STATUS_BADGE[d.status] ?? { label: d.status, className: "" };
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.userName}</div>
                      <div className="text-xs text-muted-foreground">{d.userEmail}</div>
                      <div className="text-xs text-muted-foreground font-mono">{d.userPhone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{d.planName}</div>
                      {d.bonusAmount > 0 && (
                        <div className="text-xs text-emerald-600">+KSH {d.bonusAmount.toLocaleString()} bonus</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      KSH {d.amount.toLocaleString("en-KE")}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">
                      KSH {d.dailyEarning.toLocaleString("en-KE")}
                    </TableCell>
                    <TableCell>
                      {d.paystackRef ? (
                        <span className="font-mono text-xs text-muted-foreground">{d.paystackRef.slice(0, 14)}…</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(d.createdAt).toLocaleDateString("en-KE")}
                      <div className="text-xs">{new Date(d.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {d.status === "pending" && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => activate.mutate(d.id)}
                            disabled={activate.isPending}
                          >
                            <Check className="h-3 w-3 mr-1" /> Activate
                          </Button>
                        )}
                        {(d.status === "pending" || d.status === "active") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setCancelItem(d)}
                          >
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!cancelItem} onOpenChange={(open) => !open && setCancelItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Deposit</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel{" "}
              <strong>{cancelItem?.userName}</strong>'s{" "}
              <strong>KSH {cancelItem?.amount?.toLocaleString("en-KE")}</strong>{" "}
              deposit under the <strong>{cancelItem?.planName}</strong> plan?
              <br />
              <br />
              The user will be notified via inbox. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelItem(null)}>
              Keep Deposit
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelItem && cancel.mutate(cancelItem.id)}
              disabled={cancel.isPending}
            >
              Yes, Cancel It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
