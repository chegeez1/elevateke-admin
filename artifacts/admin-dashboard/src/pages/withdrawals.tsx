import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Withdrawals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [rejectingItem, setRejectingItem] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => customFetch<any[]>("/api/admin/withdrawals"),
  });

  const approveWithdrawal = useMutation({
    mutationFn: (id: number) => 
      customFetch(`/api/admin/withdrawals/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "Withdrawal approved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const rejectWithdrawal = useMutation({
    mutationFn: ({ id, reason }: { id: number, reason: string }) => 
      customFetch(`/api/admin/withdrawals/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setRejectingItem(null);
      setRejectReason("");
      toast({ title: "Withdrawal rejected" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const filtered = withdrawals.filter((w: any) => {
    if (filter !== "all" && w.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return w.userName?.toLowerCase().includes(q) || w.userEmail?.toLowerCase().includes(q) || w.mpesaPhone?.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Withdrawal Queue</h1>
          <p className="text-muted-foreground">Review, approve, or reject user withdrawal requests.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search name, email, phone..." 
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
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>M-Pesa Phone</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center h-24">Loading withdrawals...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No withdrawals found matching criteria.</TableCell></TableRow>
            ) : (
              filtered.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <div className="font-medium">{w.userName || `User #${w.userId}`}</div>
                    <div className="text-xs text-muted-foreground">{w.userEmail}</div>
                  </TableCell>
                  <TableCell className="font-mono">{w.mpesaPhone}</TableCell>
                  <TableCell className="text-right font-bold">KSH {w.amount?.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(w.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {w.status === 'pending' && <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">Pending</Badge>}
                    {w.status === 'approved' && <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">Approved</Badge>}
                    {w.status === 'rejected' && <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200">Rejected</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {w.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => approveWithdrawal.mutate(w.id)}
                          disabled={approveWithdrawal.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => setRejectingItem(w)}
                        >
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!rejectingItem} onOpenChange={(open) => !open && setRejectingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Withdrawal</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this KSH {rejectingItem?.amount?.toLocaleString()} withdrawal from {rejectingItem?.userName}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Reason (Optional)</label>
              <Input 
                placeholder="Will be shown to the user" 
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingItem(null)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={() => rejectWithdrawal.mutate({ id: rejectingItem.id, reason: rejectReason })}
              disabled={rejectWithdrawal.isPending}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
