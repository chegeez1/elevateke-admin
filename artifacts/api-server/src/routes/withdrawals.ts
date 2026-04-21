import { Router, type IRouter } from "express";
import { db, withdrawalsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { CreateWithdrawalBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatWithdrawal(w: typeof withdrawalsTable.$inferSelect) {
  return {
    id: w.id, userId: w.userId, amount: Number(w.amount),
    phone: w.phone, status: w.status,
    adminNote: w.adminNote ?? null,
    processedAt: w.processedAt?.toISOString() ?? null,
    requestedAt: w.requestedAt.toISOString(),
  };
}

router.get("/withdrawals", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const withdrawals = await db.select().from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, userId)).orderBy(desc(withdrawalsTable.requestedAt));
  res.json(withdrawals.map(formatWithdrawal));
});

router.post("/withdrawals", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateWithdrawalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { amount, phone } = parsed.data;
  const MIN_WITHDRAWAL = 100;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (amount < MIN_WITHDRAWAL) {
    res.status(400).json({ error: `Minimum withdrawal is KSH ${MIN_WITHDRAWAL}` }); return;
  }
  if (Number(user.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance" }); return;
  }

  const newBalance = Number(user.balance) - amount;
  await db.update(usersTable).set({ balance: newBalance.toString() }).where(eq(usersTable.id, userId));

  const [withdrawal] = await db.insert(withdrawalsTable).values({
    userId, amount: amount.toString(), phone, status: "pending",
  }).returning();

  res.status(201).json(formatWithdrawal(withdrawal));
});

export default router;
