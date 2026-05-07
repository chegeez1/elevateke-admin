import { useState } from "react";
  import { Link } from "wouter";
  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import { customFetch } from "@workspace/api-client-react";
  import { Input } from "@/components/ui/input";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { useToast } from "@/hooks/use-toast";
  import { Search, Bell, ShieldCheck, ShieldX, CheckCheck, Trash2 } from "lucide-react";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";

  type FilterMode = "all" | "reminder-no-deposit" | "unverified";

  export default function Users() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterMode>("all");
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: users = [], isLoading } = useQuery({
      queryKey: ["admin-users"],
      queryFn: () => customFetch<any[]>("/api/admin/users"),
    });

    const bulkVerify = useMutation({
      mutationFn: () =>
        customFetch<{ success: boolean; count: number; message: string }>(
          "/api/admin/users/bulk-verify-emails",
          { method: "POST" },
        ),
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        setBulkConfirmOpen(false);
        toast({ title: "Bulk verification complete", description: data.message });
      },
      onError: (err: any) => {
        toast({ title: "Bulk verify failed", description: err.message, variant: "destructive" });
      },
    });

    const deleteUser = useMutation({
      mutationFn: (id: number) =>
        customFetch<{ success: boolean; message: string }>(`/api/admin/users/${id}/delete`, {
          method: "DELETE",
        }),
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        setDeleteTarget(null);
        toast({ title: "User deleted", description: data.message });
      },
      onError: (err: any) => {
        toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      },
    });

    const filteredUsers = users.filter((u: any) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search);

      if (!matchesSearch) return false;

      if (filter === "reminder-no-deposit") {
        return u.depositReminderSentAt !== null && u.totalDeposited === 0;
      }
      if (filter === "unverified") {
        return !u.emailVerified;
      }

      return true;
    });

    const reminderNoDepositCount = users.filter(
      (u: any) => u.depositReminderSentAt !== null && u.totalDeposited === 0,
    ).length;

    const unverifiedCount = users.filter((u: any) => !u.emailVerified).length;

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground">Manage platform users, view details, and adjust balances.</p>
          </div>
          {unverifiedCount > 0 && (
            <Button
              variant="outline"
              className="shrink-0 gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setBulkConfirmOpen(true)}
            >
              <CheckCheck className="h-4 w-4" />
              Verify All Unverified
              <span className="ml-1 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-xs font-semibold leading-none">
                {unverifiedCount}
              </span>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, email, or phone..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              All users
            </Button>
            <Button
              size="sm"
              variant={filter === "unverified" ? "default" : "outline"}
              onClick={() => setFilter("unverified")}
              className="gap-1.5"
            >
              <ShieldX className="h-3.5 w-3.5" />
              Unverified email
              {unverifiedCount > 0 && (
                <span className="ml-1 rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-xs font-semibold leading-none">
                  {unverifiedCount}
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant={filter === "reminder-no-deposit" ? "default" : "outline"}
              onClick={() => setFilter("reminder-no-deposit")}
              className="gap-1.5"
            >
              <Bell className="h-3.5 w-3.5" />
              Reminder sent, no deposit
              {reminderNoDepositCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-semibold leading-none">
                  {reminderNoDepositCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>VIP Level</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Reminder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">Loading users...</TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No users found.</TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user: any) => (
                  <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Link href={`/users/${user.id}`} className="block">
                        <div className="font-medium hover:underline">{user.name}</div>
                        <div className="text-xs text-muted-foreground">ID: {user.id}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/users/${user.id}`} className="block">
                        <div>{user.email}</div>
                        <div className="text-xs text-muted-foreground">{user.phone}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{user.vipLevel}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      KSH {user.balance?.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {user.emailVerified ? (
                        <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 gap-1 text-xs">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 gap-1 text-xs">
                          <ShieldX className="h-3 w-3" /> Unverified
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.depositReminderSentAt ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 w-fit text-xs gap-1">
                            <Bell className="h-3 w-3" /> Sent
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(user.depositReminderSentAt).toLocaleDateString("en-KE")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.isSuspended ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget({ id: user.id, name: user.name });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Bulk verify dialog */}
        <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCheck className="h-5 w-5 text-emerald-600" />
                Verify All Unverified Users
              </DialogTitle>
              <DialogDescription>
                This will mark <strong>{unverifiedCount} user{unverifiedCount !== 1 ? "s" : ""}</strong> as
                email-verified instantly, allowing them to log in without clicking a verification link.
                <br /><br />
                This is useful for clearing a backlog of registrations or for accounts you've manually confirmed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => bulkVerify.mutate()}
                disabled={bulkVerify.isPending}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                {bulkVerify.isPending ? "Verifying..." : `Verify ${unverifiedCount} User${unverifiedCount !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete user confirmation dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Delete User Account
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>?
                <br /><br />
                This will remove their account, balance, and all associated data. <strong>This cannot be undone.</strong>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
                disabled={deleteUser.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteUser.isPending ? "Deleting..." : "Delete Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  