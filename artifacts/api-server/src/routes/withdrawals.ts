import { Router, type IRouter } from "express";
import { db, withdrawalsTable, usersTable, platformSettingsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { CreateWithdrawalBody, GetWithdrawalsResponse, GetWithdrawalsResponseItem } from "@workspace/api-zod";
import { validateResponse } from "../lib/validate-response";
import bcrypt from "bcrypt";

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
  res.json(validateResponse("GET /withdrawals", GetWithdrawalsResponse, withdrawals.map(formatWithdrawal)));
});

router.post("/withdrawals", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateWithdrawalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { amount, phone, pin } = parsed.data;

  const settings = await db.select().from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "min_withdrawal_amount"))
    .then(async (rows) => {
      const minRow = rows[0];
      const [maxRow] = await db.select().from(platformSettingsTable)
        .where(eq(platformSettingsTable.key, "max_withdrawal_amount"));
      return {
        min: Number(minRow?.value ?? 1300),
        max: Number(maxRow?.value ?? 100000),
      };
    });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user.pinHash) {
    const pinValid = await bcrypt.compare(pin, user.pinHash);
    if (!pinValid) { res.status(401).json({ error: "Incorrect withdrawal PIN" }); return; }
  } else {
    const pwValid = await bcrypt.compare(pin, user.passwordHash);
    if (!pwValid) { res.status(401).json({ error: "Incorrect password" }); return; }
  }

  if (amount < settings.min) {
    res.status(400).json({ error: `Minimum withdrawal is KSH ${settings.min}` }); return;
  }
  if (amount > settings.max) {
    res.status(400).json({ error: `Maximum withdrawal per request is KSH ${settings.max}` }); return;
  }
  if (Number(user.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance" }); return;
  }

  const newBalance = Number(user.balance) - amount;
  await db.update(usersTable).set({ balance: newBalance.toString() }).where(eq(usersTable.id, userId));

  const [withdrawal] = await db.insert(withdrawalsTable).values({
    userId, amount: amount.toString(), phone, status: "pending",
  }).returning();

  res.status(201).json(validateResponse("POST /withdrawals", GetWithdrawalsResponseItem, formatWithdrawal(withdrawal)));
});

export default router;
