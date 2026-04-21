import { Router, type IRouter } from "express";
import { db, tradesTable, usersTable, tradeSettingsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import {
  PlaceTradeBody, CashoutTradeBody,
  GetTradeSettingsResponse, GetTradeChartResponseItem, GetTradeChartResponse,
  CashoutTradeResponse, GetTradeHistoryResponseItem, GetTradeHistoryResponse,
} from "@workspace/api-zod";
import { validateResponse } from "../lib/validate-response";

type TradeSettingsShape = ReturnType<typeof GetTradeSettingsResponse.parse>;
type ChartPointShape = ReturnType<typeof GetTradeChartResponseItem.parse>;

const router: IRouter = Router();

let tradeSettings: TradeSettingsShape = { direction: "up", updatedAt: new Date().toISOString() };

export async function initTradeSettings() {
  try {
    const [row] = await db.select().from(tradeSettingsTable).limit(1);
    if (row) {
      tradeSettings.direction = row.direction as "up" | "down";
      tradeSettings.updatedAt = row.updatedAt.toISOString();
    } else {
      await db.insert(tradeSettingsTable).values({ direction: "up" });
    }
  } catch (e) {
    // fallback to default
  }
}

export async function setTradeDirection(direction: "up" | "down") {
  tradeSettings.direction = direction;
  tradeSettings.updatedAt = new Date().toISOString();
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

function generateChartData(): Array<ChartPointShape & { open: number; close: number; high: number; low: number }> {
  const points: Array<ChartPointShape & { open: number; close: number; high: number; low: number }> = [];
  // Seed price with seconds so it's consistent within a minute but shifts over time
  const seedBase = Math.floor(Date.now() / 60000);
  const pseudoRand = (n: number) => {
    const x = Math.sin(seedBase * 9301 + n * 49297) * 0.5 + 0.5;
    return x;
  };
  let price = 1050 + pseudoRand(0) * 80;
  const now = Date.now();
  // Very weak bias so the direction is barely perceptible — chart looks random
  const trendBias = tradeSettings.direction === "up" ? 0.08 : -0.08;

  for (let i = 59; i >= 0; i--) {
    // Multi-layer noise: fast micro noise + slower swing noise
    const micro = (Math.random() - 0.5) * 6;
    const swing = (pseudoRand(i + 1) - 0.5) * 22;
    // Occasional sudden spike/reversal (about 1 in 10 candles)
    const spike = Math.random() < 0.1 ? (Math.random() - 0.5) * 40 : 0;
    const change = micro + swing * 0.35 + spike + trendBias;
    price = Math.max(900, Math.min(1200, price + change));
    const spread = Math.random() * 5 + 2;
    const open = Math.round((price - change * 0.4) * 100) / 100;
    const close = Math.round(price * 100) / 100;
    points.push({
      time: new Date(now - i * 60000).toISOString(),
      price: close,
      open,
      close,
      high: Math.round((Math.max(open, close) + spread) * 100) / 100,
      low: Math.round((Math.min(open, close) - spread) * 100) / 100,
    });
  }
  return points;
}

router.get("/trade/settings", (_req, res): void => {
  res.json(validateResponse("GET /trade/settings", GetTradeSettingsResponse, tradeSettings));
});

router.get("/trade/chart", (_req, res): void => {
  res.json(validateResponse("GET /trade/chart", GetTradeChartResponse, generateChartData()));
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

  res.status(201).json(validateResponse("POST /trade/place", GetTradeHistoryResponseItem, formatTrade(trade)));
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
  // Multiplier stored as "1x"/"2x"/"3x" — extract the number
  const multRaw = parseInt(trade.multiplier, 10) || 1;
  const userDirection = trade.direction;
  const adminDirection = tradeSettings.direction;

  let profitLoss = 0;
  let result: "win" | "loss";

  if (userDirection === adminDirection) {
    // Win: small realistic gain — 5–20% of amount, slightly higher for bigger multiplier
    // multRaw 1→ range 0.05–0.12 | 2→ 0.08–0.18 | 3→ 0.12–0.22
    const minRate = 0.04 + (multRaw - 1) * 0.03;
    const maxRate = 0.12 + (multRaw - 1) * 0.05;
    const rate = minRate + Math.random() * (maxRate - minRate);
    profitLoss = Math.round(amount * rate);
    result = "win";
  } else {
    // Loss: small realistic loss — 5–15% of amount (feels like a stop-loss hit)
    const lossRate = 0.05 + Math.random() * 0.10;
    profitLoss = -Math.round(amount * lossRate);
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

  const message = result === "win"
    ? `Trade closed — profit KSH ${profitLoss}`
    : `Trade closed — loss KSH ${Math.abs(profitLoss)}`;

  res.json(validateResponse("POST /trade/cashout", CashoutTradeResponse, { trade: formatTrade(updated), profitLoss, newBalance, message, result }));
});

router.get("/trade/history", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId)).orderBy(desc(tradesTable.startedAt)).limit(50);
  res.json(validateResponse("GET /trade/history", GetTradeHistoryResponse, trades.map(formatTrade)));
});

export { tradeSettings };
export default router;
