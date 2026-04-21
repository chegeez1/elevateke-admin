import { Layout } from "@/components/layout";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle, Gift, TrendingUp, Users, CheckCircle, Zap, Clock } from "lucide-react";

type ActivityItem = {
  id: string;
  category: "deposit" | "withdrawal" | "earning";
  subtype: string;
  amount: number;
  description: string;
  date: string;
  isCredit: boolean;
};

const categoryLabel: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  earning: "Earning",
};

const categoryColor: Record<string, string> = {
  deposit: "bg-blue-100 text-blue-700",
  withdrawal: "bg-red-100 text-red-700",
  earning: "bg-green-100 text-green-700",
};

const iconForItem = (item: ActivityItem) => {
  if (item.category === "deposit") return <ArrowDownCircle size={20} className="text-blue-600" />;
  if (item.category === "withdrawal") return <ArrowUpCircle size={20} className="text-red-500" />;
  const icons: Record<string, JSX.Element> = {
    login_bonus: <Gift size={20} className="text-amber-500" />,
    daily: <TrendingUp size={20} className="text-blue-500" />,
    referral: <Users size={20} className="text-purple-500" />,
    task: <CheckCircle size={20} className="text-green-500" />,
    trade: <Zap size={20} className="text-orange-500" />,
  };
  return icons[item.subtype] ?? <Clock size={20} className="text-gray-500" />;
};

const bgForItem = (item: ActivityItem) => {
  if (item.category === "deposit") return "bg-blue-50";
  if (item.category === "withdrawal") return "bg-red-50";
  return "bg-green-50";
};

export default function Transactions() {
  const { data: activity, isLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/activity"],
    queryFn: () => customFetch<ActivityItem[]>("/api/activity"),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500">Full history of all your deposits, withdrawals, and earnings.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading transactions...</div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-3">
                {activity.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${bgForItem(item)}`}>
                        {iconForItem(item)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{item.description}</div>
                        <div className="text-sm text-gray-400">{new Date(item.date).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <div className={`font-bold text-lg ${item.isCredit ? "text-green-600" : "text-red-500"}`}>
                        {item.isCredit ? "+" : "-"} KSH {formatNumber(item.amount)}
                      </div>
                      <Badge className={`text-xs ${categoryColor[item.category]}`} variant="outline">
                        {categoryLabel[item.category]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 text-gray-500 bg-gray-50 rounded-lg border-dashed border">
                No transactions yet. Make a deposit or claim your daily bonus!
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
