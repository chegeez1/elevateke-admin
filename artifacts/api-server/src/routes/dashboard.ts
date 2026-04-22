import { Router, type IRouter } from "express";
import { db, usersTable, depositsTable, withdrawalsTable, earningsTable, tradesTable, inboxMessagesTable } from "@workspace/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const activeDeposits = await db.select().from(depositsTable)
    .where(and(eq(depositsTable.userId, userId), eq(depositsTable.status, "active")));

  const pendingWithdrawals = await db.select({ total: sql<number>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable).where(and(eq(withdrawalsTable.userId, userId), eq(withdrawalsTable.status, "pending")));

  const todayEarnings = await db.select({ total: sql<number>`coalesce(sum(${earningsTable.amount}), 0)` })
    .from(earningsTable).where(and(eq(earningsTable.userId, userId), gte(earningsTable.createdAt, today)));

  const unreadMessages = await db.select({ count: sql<number>`count(*)` })
    .from(inboxMessagesTable).where(and(eq(inboxMessagesTable.userId, userId), eq(inboxMessagesTable.isRead, false)));

  const [activeTrade] = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.userId, userId), eq(tradesTable.status, "active")));

  const loginBonusAvailable = !user.loginBonusClaimedAt || user.loginBonusClaimedAt < today;

  // Midnight-based: claimable once per calendar day (same logic as the claim route)
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  let nextEarningAt: string | null = null;
  let canClaimEarnings = false;
  let dailyEarningsTotal = 0;
  let claimableEarningsTotal = 0;

  if (activeDeposits.length > 0) {
    // Total daily rate across all active deposits (for display/info only)
    dailyEarningsTotal = activeDeposits.reduce((sum, d) => sum + Number(d.dailyEarning), 0);

    // Eligible = lastEarningAt is null (never claimed) OR was before today midnight
    // This mirrors the exact condition in POST /api/earnings/claim
    const eligibleDeposits = activeDeposits.filter(d => !d.lastEarningAt || d.lastEarningAt < today);
    canClaimEarnings = eligibleDeposits.length > 0;
    claimableEarningsTotal = eligibleDeposits.reduce((sum, d) => sum + Number(d.dailyEarning), 0);

    // nextEarningAt = midnight tomorrow when no deposits are eligible right now
    nextEarningAt = canClaimEarnings ? null : tomorrow.toISOString();
  }

  res.json({
    balance: Number(user.balance),
    totalEarned: Number(user.totalEarned),
    totalDeposited: Number(user.totalDeposited),
    pendingWithdrawals: Number(pendingWithdrawals[0]?.total ?? 0),
    activeDeposits: activeDeposits.length,
    nextEarningAt,
    canClaimEarnings,
    dailyEarningsTotal,
    claimableEarningsTotal,
    todayEarned: Number(todayEarnings[0]?.total ?? 0),
    vipLevel: user.vipLevel,
    unreadMessages: Number(unreadMessages[0]?.count ?? 0),
    loginBonusAvailable,
    hasSetPin: !!user.pinHash,
    hasClaimedLoginBonus: !!user.loginBonusClaimedAt,
    hasFirstDeposit: Number(user.totalDeposited) > 0,
    hasFirstEarning: Number(user.totalEarned) > 0,
    activeTrade: activeTrade ? {
      id: activeTrade.id, amount: Number(activeTrade.amount), multiplier: activeTrade.multiplier,
      durationMins: activeTrade.durationMins, direction: activeTrade.direction,
      result: activeTrade.result ?? null, profitLoss: activeTrade.profitLoss ? Number(activeTrade.profitLoss) : null,
      status: activeTrade.status, startedAt: activeTrade.startedAt.toISOString(),
      endedAt: activeTrade.endedAt?.toISOString() ?? null,
    } : undefined,
  });
});

export default router;
