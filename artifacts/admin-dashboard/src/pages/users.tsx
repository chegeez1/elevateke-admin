import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Bell } from "lucide-react";

type FilterMode = "all" | "reminder-no-deposit";

export default function Users() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => customFetch<any[]>("/api/admin/users"),
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

    return true;
  });

  const reminderNoDepositCount = users.filter(
    (u: any) => u.depositReminderSentAt !== null && u.totalDeposited === 0,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Manage platform users, view details, and adjust balances.</p>
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

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All users
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
              <TableHead>Reminder</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading users...</TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No users found.</TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user: any) => (
                <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50 transition-colors" asChild>
                  <Link href={`/users/${user.id}`}>
                    <TableCell>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {user.id}</div>
                    </TableCell>
                    <TableCell>
                      <div>{user.email}</div>
                      <div className="text-xs text-muted-foreground">{user.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{user.vipLevel}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      KSH {user.balance?.toLocaleString()}
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
                  </Link>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
