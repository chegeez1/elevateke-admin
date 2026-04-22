import { Layout } from "@/components/layout";
import { useGetReferrals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { Users, Copy, Share2, Award, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Referrals() {
  const { data: refInfo, isLoading } = useGetReferrals();

  const handleCopy = () => {
    if (!refInfo) return;
    navigator.clipboard.writeText(refInfo.referralLink);
    toast.success("Referral link copied to clipboard!");
  };

  const pendingCount = refInfo
    ? refInfo.referrals.filter(r => !r.hasDeposited).length
    : 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Referrals</h1>
          <p className="text-gray-500">Invite friends and earn bonuses when they make their first deposit.</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading referral data...</div>
        ) : refInfo ? (
          <>
            <Card className="bg-primary text-primary-foreground border-none">
              <CardContent className="p-6 md:p-8">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Share2 /> Your Referral Link</h3>
                <div className="flex gap-2">
                  <Input value={refInfo.referralLink} readOnly className="bg-primary-foreground/10 border-primary-foreground/20 text-white" />
                  <Button variant="secondary" onClick={handleCopy}><Copy size={16} className="mr-2"/> Copy</Button>
                </div>
                <div className="mt-4 flex gap-4 text-sm text-primary-foreground/80">
                  <span>Code: <strong className="text-white">{refInfo.referralCode}</strong></span>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="mx-auto bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center mb-3">
                    <Users size={24} />
                  </div>
                  <h4 className="text-gray-500 font-medium">Active Referrals</h4>
                  <p className="text-3xl font-bold mt-1">{refInfo.totalReferrals}</p>
                  {pendingCount > 0 && (
                    <p className="text-xs text-amber-600 mt-1 font-medium">+{pendingCount} pending deposit</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="mx-auto bg-green-100 text-green-600 w-12 h-12 rounded-full flex items-center justify-center mb-3">
                    <Award size={24} />
                  </div>
                  <h4 className="text-gray-500 font-medium">Total Earned</h4>
                  <p className="text-3xl font-bold mt-1 text-green-600">KSH {formatNumber(refInfo.totalReferralEarnings)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 flex flex-col justify-center">
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-gray-600">Level 1 (Direct)</span>
                    <Badge variant="secondary">{refInfo.level1Count}</Badge>
                  </div>
                  <div className="flex justify-between items-center pt-3">
                    <span className="text-gray-600">Level 2 (Indirect)</span>
                    <Badge variant="outline">{refInfo.level2Count}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">Deposited only</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>My Referrals</span>
                  {refInfo.referrals.length > 0 && (
                    <span className="text-sm font-normal text-gray-500">
                      {refInfo.totalReferrals} active · {pendingCount} pending
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {refInfo.referrals.length > 0 ? (
                  <div className="space-y-3">
                    {refInfo.referrals.map(ref => (
                      <div
                        key={ref.id}
                        className={`flex justify-between items-center p-4 border rounded-lg ${
                          ref.hasDeposited ? "bg-white" : "bg-amber-50 border-amber-100"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {ref.hasDeposited ? (
                            <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                          ) : (
                            <Clock size={18} className="text-amber-400 flex-shrink-0" />
                          )}
                          <div>
                            <div className="font-semibold text-gray-900">{ref.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Joined {new Date(ref.joinedAt).toLocaleDateString()}
                              {!ref.hasDeposited && (
                                <span className="ml-2 text-amber-600 font-medium">· Awaiting first deposit</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <Badge
                            variant={ref.level === 1 ? "default" : "secondary"}
                            className="mb-1 block"
                          >
                            Level {ref.level}
                          </Badge>
                          {ref.hasDeposited ? (
                            <div className="text-sm font-medium text-green-600">
                              + KSH {formatNumber(ref.bonusAmount)}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">No bonus yet</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed">
                    <Users className="mx-auto text-gray-400 mb-3" size={32} />
                    <h4 className="font-medium text-gray-900">No referrals yet</h4>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
                      Share your referral link — you earn a bonus when your friend makes their first deposit.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
