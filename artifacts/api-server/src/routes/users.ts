import { Router, type IRouter } from "express";
import { db, usersTable, loginHistoryTable, referralsTable, earningsTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { UpdateProfileBody } from "@workspace/api-zod";
import bcrypt from "bcrypt";

const router: IRouter = Router();

function getUser(req: Express.Request) {
  return (req as typeof req & { user: JwtPayload }).user;
}

router.get("/users/profile", authenticate, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    mpesaPhone: user.mpesaPhone ?? null,
    balance: Number(user.balance), totalEarned: Number(user.totalEarned),
    totalDeposited: Number(user.totalDeposited), vipLevel: user.vipLevel,
    referralCode: user.referralCode, language: user.language,
    createdAt: user.createdAt.toISOString(),
    hasPin: !!user.pinHash,
  });
});

router.patch("/users/profile", authenticate, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.phone) updates.phone = parsed.data.phone;
  if (parsed.data.mpesaPhone != null) updates.mpesaPhone = parsed.data.mpesaPhone;
  if (parsed.data.language) updates.language = parsed.data.language;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  res.json({
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    mpesaPhone: user.mpesaPhone ?? null, balance: Number(user.balance),
    totalEarned: Number(user.totalEarned), totalDeposited: Number(user.totalDeposited),
    vipLevel: user.vipLevel, referralCode: user.referralCode, language: user.language,
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/users/pin", authenticate, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const { currentCredential, newPin } = req.body as { currentCredential?: string; newPin?: string };

  if (!newPin || !/^\d{4,6}$/.test(newPin)) {
    res.status(400).json({ error: "PIN must be 4–6 digits (numbers only)" }); return;
  }
  if (!currentCredential) {
    res.status(400).json({ error: "Current password or PIN is required" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user.pinHash) {
    const valid = await bcrypt.compare(currentCredential, user.pinHash);
    if (!valid) { res.status(401).json({ error: "Current PIN is incorrect" }); return; }
  } else {
    const valid = await bcrypt.compare(currentCredential, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Password is incorrect" }); return; }
  }

  const pinHash = await bcrypt.hash(newPin, 10);
  await db.update(usersTable).set({ pinHash }).where(eq(usersTable.id, userId));
  res.json({ message: "Withdrawal PIN updated successfully" });
});

router.get("/users/referrals", authenticate, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const refs = await db.select({
    id: referralsTable.id,
    referredId: referralsTable.referredId,
    level: referralsTable.level,
    bonusAmount: referralsTable.bonusAmount,
    createdAt: referralsTable.createdAt,
    name: usersTable.name,
    totalDeposited: usersTable.totalDeposited,
  }).from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
    .where(eq(referralsTable.referrerId, userId));

  const totalEarnings = await db.select({ total: sql<number>`coalesce(sum(${earningsTable.amount}), 0)` })
    .from(earningsTable).where(and(eq(earningsTable.userId, userId), eq(earningsTable.type, "referral")));

  // Only count referrals where the referred user has made at least one deposit
  const activeRefs = refs.filter(r => Number(r.totalDeposited ?? 0) > 0);
  const l1Active = activeRefs.filter(r => r.level === 1);
  const l2Active = activeRefs.filter(r => r.level === 2);
  const baseUrl = process.env.SITE_URL || "https://elevateke.com";

  res.json({
    referralCode: user.referralCode,
    referralLink: `${baseUrl}/register?ref=${user.referralCode}`,
    totalReferrals: activeRefs.length,
    level1Count: l1Active.length,
    level2Count: l2Active.length,
    totalReferralEarnings: Number(totalEarnings[0]?.total ?? 0),
    referrals: refs.map(r => ({
      id: r.id, name: r.name ?? "Unknown", level: r.level,
      bonusAmount: Number(r.bonusAmount), joinedAt: r.createdAt.toISOString(),
      hasDeposited: Number(r.totalDeposited ?? 0) > 0,
    })),
  });
});

router.get("/users/login-history", authenticate, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const history = await db.select().from(loginHistoryTable)
    .where(eq(loginHistoryTable.userId, userId))
    .orderBy(desc(loginHistoryTable.createdAt)).limit(20);
  res.json(history.map(h => ({ id: h.id, ip: h.ip ?? null, createdAt: h.createdAt.toISOString() })));
});

router.post("/users/claim-login-bonus", authenticate, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (user.loginBonusClaimedAt && user.loginBonusClaimedAt >= today) {
    res.status(400).json({ error: "Login bonus already claimed today" });
    return;
  }

  const [bonusSetting] = await db.select().from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "login_bonus_amount"));
  const bonusAmount = Number(bonusSetting?.value ?? 10);

  const newBalance = Number(user.balance) + bonusAmount;
  const newTotalEarned = Number(user.totalEarned) + bonusAmount;

  await db.update(usersTable).set({
    balance: newBalance.toString(),
    totalEarned: newTotalEarned.toString(),
    loginBonusClaimedAt: new Date(),
  }).where(eq(usersTable.id, userId));

  const { earningsTable: et } = await import("@workspace/db");
  await db.insert(et).values({ userId, amount: bonusAmount.toString(), type: "login_bonus", description: "Daily login bonus" });

  res.json({ amount: bonusAmount, newBalance, message: `Login bonus claimed! KSH ${bonusAmount} added to your balance.` });
});

export default router;
