import { Router, type IRouter } from "express";
import { db, depositsTable, withdrawalsTable, earningsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/activity", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;

  const [deposits, withdrawals, earnings] = await Promise.all([
    db.select().from(depositsTable).where(eq(depositsTable.userId, userId)).orderBy(desc(depositsTable.createdAt)).limit(30),
    db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, userId)).orderBy(desc(withdrawalsTable.requestedAt)).limit(30),
    db.select().from(earningsTable).where(eq(earningsTable.userId, userId)).orderBy(desc(earningsTable.createdAt)).limit(30),
  ]);

  const earningLabels: Record<string, string> = {
    login_bonus: "Daily Login Bonus",
    daily: "Daily Return",
    referral: "Referral Bonus",
    task: "Task Reward",
    trade: "Trade Profit",
  };

  const activities = [
    ...deposits.map(d => ({
      id: `dep-${d.id}`,
      category: "deposit" as const,
      subtype: d.status,
      amount: Number(d.amount),
      description: `Deposit (${d.status})`,
      date: d.createdAt.toISOString(),
      isCredit: true,
    })),
    ...withdrawals.map(w => ({
      id: `wit-${w.id}`,
      category: "withdrawal" as const,
      subtype: w.status,
      amount: Number(w.amount),
      description: `Withdrawal (${w.status})`,
      date: w.requestedAt.toISOString(),
      isCredit: false,
    })),
    ...earnings.map(e => ({
      id: `ear-${e.id}`,
      category: "earning" as const,
      subtype: e.type,
      amount: Number(e.amount),
      description: earningLabels[e.type] ?? e.description ?? e.type,
      date: e.createdAt.toISOString(),
      isCredit: true,
    })),
  ];

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json(activities.slice(0, 100));
});

export default router;
