import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetTradeChart, useGetTradeHistory, usePlaceTrade, useCashoutTrade, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Clock, History } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Badge } from "@/components/ui/badge";

export default function Trade() {
  const { data: chartData } = useGetTradeChart({ query: { refetchInterval: 10000 } });
  const { data: history } = useGetTradeHistory();
  const { data: summary } = useGetDashboardSummary();
  const placeTradeMut = usePlaceTrade();
  const cashoutMut = useCashoutTrade();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("100");
  const [multiplier, setMultiplier] = useState("1");
  const [duration, setDuration] = useState("1");
  const [direction, setDirection] = useState<"up" | "down">("up");

  const handlePlaceTrade = (e: React.FormEvent) => {
    e.preventDefault();
    placeTradeMut.mutate({ data: { amount: Number(amount), multiplier: Number(multiplier), durationMins: Number(duration), direction } }, {
      onSuccess: () => {
        toast.success("Trade placed successfully!");
        queryClient.invalidateQueries({ queryKey: ["/api/trade/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
      onError: (err) => {
        toast.error("Trade failed", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  const handleCashout = () => {
    if (!summary?.activeTrade) return;
    cashoutMut.mutate({ data: { tradeId: summary.activeTrade.id } }, {
      onSuccess: (res) => {
        toast.success(res.message, { description: `Profit/Loss: KSH ${res.profitLoss}` });
        queryClient.invalidateQueries({ queryKey: ["/api/trade/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
      onError: (err) => {
        toast.error("Cashout failed", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  const formattedChartData = chartData?.map(d => ({
    ...d,
    timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })) || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trade</h1>
          <p className="text-gray-500">Predict market movements and multiply your wealth.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Live Market Chart</span>
                  <div className="flex items-center gap-2 text-sm font-normal text-gray-500">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    Live Data
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="timeLabel" stroke="#9ca3af" fontSize={12} tickLine={false} />
                      <YAxis domain={['auto', 'auto']} stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `KSH ${val}`} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {summary?.activeTrade && (
              <Card className="border-primary border-2 bg-primary/5">
                <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                      <Clock size={20} className="animate-pulse" /> Active Trade
                    </h3>
                    <p className="text-gray-600 mt-1">
                      KSH {formatNumber(summary.activeTrade.amount)} • {summary.activeTrade.multiplier}x • {summary.activeTrade.direction.toUpperCase()}
                    </p>
                  </div>
                  <Button size="lg" onClick={handleCashout} disabled={cashoutMut.isPending} className="w-full md:w-auto">
                    {cashoutMut.isPending ? "Processing..." : "Cashout Now"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History size={20} /> Trade History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {history?.slice(0, 5).map(trade => (
                    <div key={trade.id} className="flex justify-between items-center border-b pb-4 last:border-0 last:pb-0">
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          KSH {formatNumber(trade.amount)} 
                          <Badge variant={trade.direction === 'up' ? 'default' : 'destructive'} className="text-[10px] px-1 py-0 h-4">
                            {trade.direction.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500">{new Date(trade.startedAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        {trade.status === 'active' ? (
                          <span className="text-amber-500 font-medium">Active</span>
                        ) : (
                          <span className={`font-bold ${trade.result === 'win' ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.result === 'win' ? '+' : ''}{trade.profitLoss ? `KSH ${formatNumber(trade.profitLoss)}` : '-'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!history || history.length === 0) && (
                    <div className="text-center text-gray-500 py-4">No trading history yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Place Trade</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePlaceTrade} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (KSH)</Label>
                    <Input id="amount" type="number" min="10" value={amount} onChange={e => setAmount(e.target.value)} required />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Multiplier</Label>
                    <Select value={multiplier} onValueChange={setMultiplier}>
                      <SelectTrigger><SelectValue placeholder="Select multiplier" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x (Low Risk)</SelectItem>
                        <SelectItem value="2">2x (Medium Risk)</SelectItem>
                        <SelectItem value="3">3x (High Risk)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Minute</SelectItem>
                        <SelectItem value="5">5 Minutes</SelectItem>
                        <SelectItem value="15">15 Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <Button 
                      type="button" 
                      variant={direction === 'up' ? 'default' : 'outline'}
                      className={`w-full ${direction === 'up' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                      onClick={() => setDirection('up')}
                    >
                      <TrendingUp className="mr-2" size={16} /> UP
                    </Button>
                    <Button 
                      type="button" 
                      variant={direction === 'down' ? 'destructive' : 'outline'}
                      className="w-full"
                      onClick={() => setDirection('down')}
                    >
                      <TrendingDown className="mr-2" size={16} /> DOWN
                    </Button>
                  </div>

                  {summary?.activeTrade ? (
                    <Button
                      type="button"
                      className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white"
                      size="lg"
                      onClick={handleCashout}
                      disabled={cashoutMut.isPending}
                    >
                      {cashoutMut.isPending ? "Closing..." : "Close Trade"}
                    </Button>
                  ) : (
                    <Button type="submit" className="w-full mt-4" size="lg" disabled={placeTradeMut.isPending}>
                      {placeTradeMut.isPending ? "Placing..." : "Place Trade"}
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-50 border-none">
              <CardContent className="p-4 text-sm text-gray-600">
                <p><strong>Balance:</strong> KSH {formatNumber(summary?.balance || 0)}</p>
                <p className="mt-2">Trade carefully. Higher multipliers yield higher profits but also increase risk.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
