import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetProfile, useUpdateProfile, useGetLoginHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { User, Award, History, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";

export default function Profile() {
  const { data: profile, isLoading: loadingProfile } = useGetProfile();
  const { data: history } = useGetLoginHistory();
  const updateMut = useUpdateProfile();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [language, setLanguage] = useState("en");

  const [currentCredential, setCurrentCredential] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinPending, setPinPending] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone);
      setMpesaPhone(profile.mpesaPhone || "");
      setLanguage(profile.language || "en");
    }
  }, [profile]);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateMut.mutate({ data: { name, phone, mpesaPhone, language } }, {
      onSuccess: () => {
        toast.success("Profile updated successfully!");
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      },
      onError: (err) => {
        toast.error("Update failed", { description: err.data?.error || "Unknown error" });
      }
    });
  };

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      toast.error("PIN must be 4–6 digits (numbers only)");
      return;
    }
    setPinPending(true);
    try {
      await customFetch("/api/users/pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentCredential, newPin }),
      });
      toast.success("Withdrawal PIN updated successfully!");
      setCurrentCredential("");
      setNewPin("");
      setConfirmPin("");
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to update PIN");
    } finally {
      setPinPending(false);
    }
  };

  const getVipColor = (level: string = "") => {
    switch (level.toLowerCase()) {
      case "bronze": return "bg-gray-400";
      case "silver": return "bg-slate-300 text-slate-900";
      case "gold": return "bg-amber-400 text-amber-900";
      case "platinum": return "bg-purple-500";
      default: return "bg-gray-200 text-gray-800";
    }
  };

  if (loadingProfile) return <Layout><div className="p-8 text-center">Loading profile...</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-500">Manage your personal information and preferences.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User size={20}/> Personal Details</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" value={profile?.email} disabled className="bg-gray-50" />
                      <p className="text-xs text-gray-500">Contact support to change email.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Account Phone</Label>
                      <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mpesaPhone">Default M-Pesa Number</Label>
                      <Input id="mpesaPhone" value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} placeholder="e.g. 0712345678" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="language">Language Preference</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="sw">Swahili</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={updateMut.isPending}>
                      {updateMut.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound size={20} />
                  Withdrawal PIN
                  {profile?.hasPin && (
                    <Badge variant="outline" className="ml-2 text-emerald-600 border-emerald-300 bg-emerald-50 gap-1">
                      <ShieldCheck size={12} /> Active
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {profile?.hasPin
                    ? "Your withdrawal PIN is set. Enter your current PIN to change it."
                    : "Set a dedicated 4–6 digit PIN for withdrawals instead of your account password."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePinChange} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentCredential">
                        {profile?.hasPin ? "Current PIN" : "Account Password"}
                      </Label>
                      <Input
                        id="currentCredential"
                        type="password"
                        inputMode={profile?.hasPin ? "numeric" : "text"}
                        value={currentCredential}
                        onChange={e => setCurrentCredential(e.target.value)}
                        placeholder={profile?.hasPin ? "Current PIN" : "Your password"}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPin">New PIN</Label>
                      <Input
                        id="newPin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                        placeholder="4–6 digits"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPin">Confirm PIN</Label>
                      <Input
                        id="confirmPin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                        placeholder="Repeat new PIN"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-gray-500">
                      Your PIN is required every time you request a withdrawal.
                    </p>
                    <Button type="submit" disabled={pinPending} variant="outline" className="border-primary text-primary hover:bg-primary hover:text-white">
                      {pinPending ? "Saving..." : profile?.hasPin ? "Change PIN" : "Set PIN"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History size={20}/> Login History</CardTitle>
              </CardHeader>
              <CardContent>
                {history && history.length > 0 ? (
                  <div className="space-y-3">
                    {history.slice(0, 5).map(h => (
                      <div key={h.id} className="flex justify-between items-center text-sm py-2 border-b last:border-0">
                        <span className="text-gray-600">{new Date(h.createdAt).toLocaleString()}</span>
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">{h.ip || 'Unknown IP'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No login history available.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="text-center overflow-hidden">
              <div className={`h-24 ${getVipColor(profile?.vipLevel)} w-full`}></div>
              <CardContent className="pt-0 relative">
                <div className={`w-20 h-20 mx-auto rounded-full border-4 border-white flex items-center justify-center text-white -mt-10 ${getVipColor(profile?.vipLevel)} shadow-md`}>
                  <Award size={32} />
                </div>
                <h3 className="font-bold text-xl mt-4">{profile?.name}</h3>
                <Badge className={`mt-2 ${getVipColor(profile?.vipLevel)} border-none`}>VIP {profile?.vipLevel}</Badge>
                
                <div className="mt-6 text-sm text-gray-600 space-y-2 text-left">
                  <div className="flex justify-between pb-2 border-b">
                    <span>Member Since</span>
                    <span className="font-medium text-gray-900">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b">
                    <span>Total Deposited</span>
                    <span className="font-medium text-gray-900">KSH {formatNumber(profile?.totalDeposited || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Earned</span>
                    <span className="font-medium text-green-600">KSH {formatNumber(profile?.totalEarned || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
