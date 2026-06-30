import { useState } from "react";
  import { useLocation } from "wouter";
  import { useAuth } from "@/lib/auth";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { toast } from "sonner";

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return data as T;
  }

  export default function VerifyEmail() {
    const [, setLocation] = useLocation();
    const { setToken } = useAuth();

    const params = new URLSearchParams(window.location.search);
    const emailFromUrl = params.get("email") ?? "";

    const [otp, setOtp] = useState("");
    const [email, setEmail] = useState(emailFromUrl);
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const handleVerify = async (e: React.FormEvent) => {
      e.preventDefault();
      if (otp.length !== 6) {
        toast.error("Please enter the 6-digit code from your email.");
        return;
      }
      setLoading(true);
      try {
        const data = await apiPost<{ token: string }>("/auth/verify-email", { email, otp });
        setToken(data.token);
        toast.success("Email verified! Welcome to ElevateKe.");
        setTimeout(() => setLocation("/dashboard"), 1000);
      } catch (err: unknown) {
        const e = err as { error?: string };
        toast.error(e?.error ?? "Verification failed. Please check your code.");
      } finally {
        setLoading(false);
      }
    };

    const handleResend = async () => {
      if (!email.trim()) {
        toast.error("Please enter your email address.");
        return;
      }
      setResendLoading(true);
      try {
        await apiPost("/auth/resend-verification", { email });
        toast.success("New code sent! Check your inbox.");
        setResendCooldown(60);
        const interval = setInterval(() => {
          setResendCooldown(prev => {
            if (prev <= 1) { clearInterval(interval); return 0; }
            return prev - 1;
          });
        }, 1000);
      } catch (err: unknown) {
        const e = err as { error?: string };
        toast.error(e?.error ?? "Failed to resend. Please try again.");
      } finally {
        setResendLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-1">
            <div className="text-4xl mb-2">📩</div>
            <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
            <p className="text-sm text-gray-500">
              We sent a 6-digit verification code to{" "}
              {emailFromUrl ? (
                <span className="font-semibold text-gray-700">{emailFromUrl}</span>
              ) : (
                "your email address"
              )}
              . Enter it below to activate your account.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              {!emailFromUrl && (
                <div className="space-y-1">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="otp">6-digit code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-2xl font-mono tracking-widest h-14"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                {loading ? "Verifying…" : "Verify Email"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">Didn't receive the code?</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={resendLoading || resendCooldown > 0}
                className="text-green-600 hover:text-green-700"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : resendLoading
                  ? "Sending…"
                  : "Resend code"}
              </Button>
            </div>

            <p className="text-center text-sm text-gray-500 mt-4">
              Already verified?{" "}
              <a href="/login" className="text-green-600 hover:underline">
                Log in
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  