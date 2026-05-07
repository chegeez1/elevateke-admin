import { useEffect, useState } from "react";
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

  const [status, setStatus] = useState<"verifying" | "success" | "error" | "idle">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("idle");
      return;
    }
    setStatus("verifying");
    apiPost<{ token: string }>("/auth/verify-email", { token })
      .then((data) => {
        setToken(data.token);
        setStatus("success");
        toast.success("Email verified! Welcome to ElevateKe.");
        setTimeout(() => setLocation("/dashboard"), 1500);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err?.error ?? "Verification failed. The link may have expired.");
      });
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendLoading(true);
    try {
      await apiPost("/auth/resend-verification", { email: resendEmail });
      setResendSent(true);
      toast.success("Verification email resent. Check your inbox.");
    } catch (err: unknown) {
      const e = err as { error?: string };
      toast.error(e?.error ?? "Failed to resend. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  if (status === "verifying") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto mb-4" />
            <p className="text-gray-600">Verifying your email address…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Email Verified!</h2>
            <p className="text-gray-500">Redirecting you to your dashboard…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <div className="text-4xl mb-2">📧</div>
          <CardTitle className="text-2xl font-bold">
            {status === "error" ? "Link Expired or Invalid" : "Check Your Email"}
          </CardTitle>
          <p className="text-sm text-gray-500">
            {status === "error"
              ? errorMsg
              : "We sent a verification link to your email address. Click the link to activate your account."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!resendSent ? (
            <>
              <p className="text-sm text-gray-600 text-center">
                Didn't receive the email? Enter your address to resend.
              </p>
              <form onSubmit={handleResend} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="resend-email">Email address</Label>
                  <Input
                    id="resend-email"
                    type="email"
                    placeholder="you@example.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resendLoading}>
                  {resendLoading ? "Sending…" : "Resend verification email"}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center text-green-600 font-medium py-4">
              ✓ Verification email sent! Check your inbox (and spam folder).
            </div>
          )}
          <p className="text-center text-sm text-gray-500">
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
