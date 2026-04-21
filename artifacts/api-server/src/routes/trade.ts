import { Router, type IRouter } from "express";
import { db, tradesTable, usersTable, tradeSettingsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { PlaceTradeBody, CashoutTradeBody } from "@workspace/api-zod";

const router: IRouter = Router();

let tradeSettings = { direction: "up" as "up" | "down", lastUpdated: new Date().toISOString() };

export async function initTradeSettings() {
  try {
    const [row] = await db.select().from(tradeSettingsTable).limit(1);
    if (row) {
      tradeSettings.direction = row.direction as "up" | "down";
      tradeSettings.lastUpdated = row.updatedAt.toISOString();
    } else {
      await db.insert(tradeSettingsTable).values({ direction: "up" });
    }
  } catch (e) {
    // fallback to default
  }
}

export async function setTradeDirection(direction: "up" | "down") {
  tradeSettings.direction = direction;
  tradeSettings.lastUpdated = new Date().toISOString();
  const [existing] = await db.select().from(tradeSettingsTable).limit(1);
  if (existing) {
    await db.update(tradeSettingsTable).set({ direction, updatedAt: new Date() }).where(eq(tradeSettingsTable.id, existing.id));
  } else {
    await db.insert(tradeSettingsTable).values({ direction });
  }
}

function formatTrade(t: typeof tradesTable.$inferSelect) {
  return {
    id: t.id, userId: t.userId, amount: Number(t.amount),
    multiplier: t.multiplier, durationMins: t.durationMins,
    direction: t.direction, result: t.result ?? null,
    profitLoss: t.profitLoss ? Number(t.profitLoss) : null,
    status: t.status,
    startedAt: t.startedAt.toISOString(),
    endedAt: t.endedAt?.toISOString() ?? null,
  };
}

function generateChartData() {
  const points = [];
  let price = 1000 + Math.random() * 200;
  const now = Date.now();
  for (let i = 59; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 20;
    price = Math.max(800, price + change + (tradeSettings.direction === "up" ? 2 : -2));
    points.push({
      timestamp: new Date(now - i * 60000).toISOString(),
      price: Math.round(price * 100) / 100,
      open: Math.round((price - Math.abs(change)) * 100) / 100,
      close: Math.round(price * 100) / 100,
      high: Math.round((price + Math.random() * 10) * 100) / 100,
      low: Math.round((price - Math.random() * 10) * 100) / 100,
    });
  }
  return points;
}

router.get("/trade/settings", (_req, res): void => {
  res.json(tradeSettings);
});

router.get("/trade/chart", (_req, res): void => {
  res.json(generateChartData());
});

router.post("/trade/place", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const parsed = PlaceTradeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { amount, multiplier, durationMins, direction } = parsed.data;

  const [existingTrade] = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.userId, userId), eq(tradesTable.status, "active")));
  if (existingTrade) {
    res.status(400).json({ error: "You already have an active trade. Cashout first." }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || Number(user.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance" }); return;
  }

  const newBalance = Number(user.balance) - amount;
  await db.update(usersTable).set({ balance: newBalance.toString() }).where(eq(usersTable.id, userId));

  const [trade] = await db.insert(tradesTable).values({
    userId, amount: amount.toString(),
    multiplier: multiplier as "1x" | "2x" | "3x",
    durationMins, direction: direction as "up" | "down",
    status: "active", startedAt: new Date(),
  }).returning();

  res.status(201).json(formatTrade(trade));
});

router.post("/trade/cashout", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CashoutTradeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { tradeId } = parsed.data;
  const [trade] = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.id, tradeId), eq(tradesTable.userId, userId), eq(tradesTable.status, "active")));

  if (!trade) { res.status(400).json({ error: "No active trade found with that ID" }); return; }

  const amount = Number(trade.amount);
  const mult = Number(trade.multiplier) || 1;
  const userDirection = trade.direction;
  const adminDirection = tradeSettings.direction;

  let profitLoss = 0;
  let result: "win" | "loss";

  if (userDirection === adminDirection) {
    profitLoss = amount * mult * 0.8;
    result = "win";
  } else {
    profitLoss = -(amount * 0.5);
    result = "loss";
  }

  const payout = amount + profitLoss;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const newBalance = Math.max(0, Number(user?.balance ?? 0) + payout);
  const newEarned = result === "win" ? Number(user?.totalEarned ?? 0) + profitLoss : Number(user?.totalEarned ?? 0);

  await db.update(usersTable).set({
    balance: newBalance.toString(), totalEarned: newEarned.toString(),
  }).where(eq(usersTable.id, userId));

  const [updated] = await db.update(tradesTable).set({
    result, profitLoss: profitLoss.toString(), status: "closed", endedAt: new Date(),
  }).where(eq(tradesTable.id, tradeId)).returning();

  res.json({ trade: formatTrade(updated), profitLoss, payout, result });
});

router.get("/trade/history", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId)).orderBy(desc(tradesTable.startedAt)).limit(50);
  res.json(trades.map(formatTrade));
});

export { tradeSettings };
export default router;
