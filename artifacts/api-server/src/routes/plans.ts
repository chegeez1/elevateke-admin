import { Router, type IRouter } from "express";
import { db, depositPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function formatPlan(plan: typeof depositPlansTable.$inferSelect) {
  const dailyRate = Number(plan.dailyRate);
  const minAmount = Number(plan.minAmount);
  const fixedAmount = plan.fixedAmount ? Number(plan.fixedAmount) : null;
  const effectiveAmount = fixedAmount ?? minAmount;
  return {
    id: plan.id, name: plan.name,
    fixedAmount,
    minAmount,
    maxAmount: plan.maxAmount ? Number(plan.maxAmount) : null,
    dailyRate, dailyEarning: effectiveAmount * dailyRate,
    durationDays: plan.durationDays, bonusPercent: Number(plan.bonusPercent),
    isActive: plan.isActive, description: plan.description ?? null,
    createdAt: plan.createdAt.toISOString(),
  };
}

router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(depositPlansTable).where(eq(depositPlansTable.isActive, true));
  res.json(plans.map(formatPlan));
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [plan] = await db.select().from(depositPlansTable).where(eq(depositPlansTable.id, id));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(formatPlan(plan));
});

export default router;
