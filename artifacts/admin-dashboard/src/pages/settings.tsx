import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, Settings2, TrendingUp, DollarSign, Users, ArrowDownCircle, ArrowUpCircle, Star } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

interface SettingMeta {
  value: string;
  label: string;
  description: string | null;
}
type SettingsMap = Record<string, SettingMeta>;

const GROUPS = [
  {
    title: "Daily Login Bonus",
    icon: Star,
    color: "text-amber-600",
    keys: ["login_bonus_amount", "signup_bonus_amount"],
  },
  {
    title: "Withdrawal Limits",
    icon: ArrowUpCircle,
    color: "text-red-600",
    keys: ["min_withdrawal_amount", "max_withdrawal_amount"],
  },
  {
    title: "Referral Commissions",
    icon: Users,
    color: "text-purple-600",
    keys: ["referral_bonus_l1_percent", "referral_bonus_l2_percent"],
  },
  {
    title: "VIP Level Thresholds",
    icon: TrendingUp,
    color: "text-blue-600",
    keys: ["vip_silver_min", "vip_gold_min", "vip_platinum_min"],
  },
];

const KEY_SUFFIX: Record<string, string> = {
  referral_bonus_l1_percent: "%",
  referral_bonus_l2_percent: "%",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customFetch<SettingsMap>("/api/admin/settings")
      .then((data) => {
        setSettings(data);
        const initial: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) initial[k] = v.value;
        setValues(initial);
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (keys: string[]) => {
    const subset: Record<string, string> = {};
    for (const k of keys) if (values[k] !== undefined) subset[k] = values[k];
    setSaving(true);
    try {
      await customFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subset),
      });
      toast({ title: "Settings saved", description: "Changes are live immediately." });
      setSettings((prev) => {
        const updated = { ...prev };
        for (const [k, v] of Object.entries(subset)) {
          if (updated[k]) updated[k] = { ...updated[k], value: v };
        }
        return updated;
      });
    } catch {
      toast({ title: "Failed to save", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading platform settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings2 size={28} /> Platform Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Adjust every amount circulating on the platform. Changes apply immediately to new transactions.
        </p>
      </div>

      {GROUPS.map((group) => {
        const Icon = group.icon;
        const groupKeys = group.keys.filter((k) => settings[k] !== undefined);
        if (groupKeys.length === 0) return null;

        return (
          <Card key={group.title}>
            <CardHeader className="pb-3">
              <CardTitle className={`flex items-center gap-2 text-lg ${group.color}`}>
                <Icon size={20} /> {group.title}
              </CardTitle>
              <CardDescription>
                {group.title === "Daily Login Bonus" && "Amounts credited to users as bonuses."}
                {group.title === "Withdrawal Limits" && "Control the minimum and maximum per withdrawal request."}
                {group.title === "Referral Commissions" && "Percentage of a referred user's first deposit credited to their referrers."}
                {group.title === "VIP Level Thresholds" && "Minimum cumulative deposits required to reach each VIP tier."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {groupKeys.map((key) => {
                const meta = settings[key];
                const suffix = KEY_SUFFIX[key] ?? "KSH";
                const isPct = suffix === "%";
                return (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div>
                      <Label className="text-sm font-semibold">{meta.label}</Label>
                      {meta.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        {!isPct && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">KSH</span>
                        )}
                        <Input
                          type="number"
                          min={0}
                          step={isPct ? 0.1 : 1}
                          value={values[key] ?? ""}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className={isPct ? "text-right pr-8" : "pl-12"}
                        />
                        {isPct && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <Separator />
              <div className="flex justify-end">
                <Button
                  onClick={() => handleSave(groupKeys)}
                  disabled={saving}
                  size="sm"
                  className="gap-2"
                >
                  <Save size={14} />
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <DollarSign size={16} /> Plan-Level Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Each deposit plan has its own <strong>daily rate</strong>, <strong>bonus %</strong>, and <strong>minimum amount</strong>. Manage these individually on the{" "}
            <a href="/plans" className="underline text-primary">Plans page</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
