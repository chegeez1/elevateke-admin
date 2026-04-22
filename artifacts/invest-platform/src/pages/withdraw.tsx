import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetWithdrawals, useCreateWithdrawal, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ArrowDownToLine, Clock, CheckCircle2, XCircle } from "lucide-react";

export default function Withdraw() {
  const { data: user } = useGetMe();
  const { data: withdrawals, isLoading } = useGetWithdrawals();
  const withdrawMut = useCreateWithdrawal();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(user?.mpesaPhone || user?.phone || "");
  const [pin, setPin] = useState("");

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(amount) < 1300) {
      toast.error("Minimum withdrawal is KSH 1,300");
      return;
    }
    
    withdrawMut.mutate({ data: { amount: Number(amount), phone, pin } }, {
      onSuccess: () => {
        toast.success("Withdrawal requested successfully!");
        setAmount("");
        setPin("");
        queryClient.invalidateQueries({ queryKey: ["/api/withdrawals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      },
      onError: (err) => {
        toast.error("Withdrawal failed", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'approved': return <CheckCircle2 className="text-green-500" size={16} />;
      case 'rejected': return <XCircle className="text-red-500" size={16} />;
      default: return <Clock className="text-amber-500" size={16} />;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Withdraw</h1>
          <p className="text-gray-500">Transfer your earnings to M-Pesa.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Request Withdrawal</CardTitle>
              <CardDescription>Minimum withdrawal: KSH 1,300</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-primary/5 rounded-lg p-4 mb-6 border border-primary/10">
                <p className="text-sm text-gray-500">Available Balance</p>
                <p className="text-2xl font-bold text-primary">KSH {formatNumber(user?.balance || 0)}</p>
              </div>

              <form onSubmit={handleWithdraw} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (KSH)</Label>
                  <Input id="amount" type="number" min="100" value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">M-Pesa Phone Number</Label>
                  <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">Withdrawal PIN</Label>
                  <Input id="pin" type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter your PIN (or password if no PIN set)" required />
                </div>
                <Button type="submit" className="w-full" disabled={withdrawMut.isPending}>
                  <ArrowDownToLine className="mr-2" size={16} />
                  {withdrawMut.isPending ? "Processing..." : "Withdraw via M-Pesa"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Withdrawal History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading history...</div>
              ) : withdrawals && withdrawals.length > 0 ? (
                <div className="space-y-4">
                  {withdrawals.map(w => (
                    <div key={w.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="font-bold text-lg">KSH {formatNumber(w.amount)}</div>
                        <div className="text-sm text-gray-500">{new Date(w.requestedAt).toLocaleString()}</div>
                        <div className="text-xs text-gray-400 mt-1">To: {w.phone}</div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <Badge variant="outline" className="flex items-center gap-1 bg-white">
                          {getStatusIcon(w.status)}
                          <span className="capitalize">{w.status}</span>
                        </Badge>
                        {w.adminNote && w.status === 'rejected' && (
                          <span className="text-xs text-red-500 max-w-[150px] truncate">{w.adminNote}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed text-gray-500">
                  No withdrawals yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
