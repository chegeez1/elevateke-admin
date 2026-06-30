import { Router, type IRouter } from "express";
import {
  db,
  depositsTable,
  depositPlansTable,
  usersTable,
  inboxMessagesTable,
  platformSettingsTable,
  earningsTable,
  referralsTable,
} from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { CreateDepositBody, VerifyDepositBody } from "@workspace/api-zod";
import { sendDepositConfirmationEmail } from "../mailer";

const router: IRouter = Router();

const _ttlEnv = Number(process.env.DEPOSIT_PENDING_TTL_MINUTES);
const EXPIRE_AFTER_MINUTES = Number.isFinite(_ttlEnv) && _ttlEnv > 0 ? _ttlEnv : 30;
const EXPIRE_AFTER_MS = EXPIRE_AFTER_MINUTES * 60 * 1000;

export async function expireStalePendingDeposits(userId?: number) {
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_MS);
  const where =
    userId !== undefined
      ? and(eq(depositsTable.status, "pending"), lt(depositsTable.createdAt, cutoff), eq(depositsTable.userId, userId))
      : and(eq(depositsTable.status, "pending"), lt(depositsTable.createdAt, cutoff));
  await db.update(depositsTable).set({ status: "expired" }).where(where);
}

function formatDeposit(d: typeof depositsTable.$inferSelect, planName: string) {
  return {
    id: d.id,
    userId: d.userId,
    planId: d.planId,
    planName,
    amount: Number(d.amount),
    bonusAmount: Number(d.bonusAmount),
    dailyEarning: Number(d.dailyEarning),
    status: d.status,
    autoRenew: d.autoRenew,
    startsAt: d.startsAt?.toISOString() ?? null,
    endsAt: d.endsAt?.toISOString() ?? null,
    lastEarningAt: d.lastEarningAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    expiresAt:
      d.status === "pending"
        ? new Date(d.createdAt.getTime() + EXPIRE_AFTER_MS).toISOString()
        : null,
  };
}

/**
 * Format a Kenyan phone number to the international format expected by Paystack.
 * Examples: 0712345678 → 254712345678, +254712345678 → 254712345678
 */
function formatPhoneForPaystack(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "").replace(/^\+/, "");
  if (cleaned.startsWith("254")) return cleaned;
  if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
  return "254" + cleaned;
}

router.get("/deposits", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  await expireStalePendingDeposits(userId);
  const deposits = await db
    .select({ deposit: depositsTable, planName: depositPlansTable.name })
    .from(depositsTable)
    .leftJoin(depositPlansTable, eq(depositsTable.planId, depositPlansTable.id))
    .where(eq(depositsTable.userId, userId))
    .orderBy(desc(depositsTable.createdAt));
  res.json(deposits.map(({ deposit, planName }) => formatDeposit(deposit, planName ?? "Unknown")));
});

router.post("/deposits", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateDepositBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { planId } = parsed.data;
  const autoRenew = parsed.data.autoRenew ?? false;

  const [plan] = await db.select().from(depositPlansTable).where(eq(depositPlansTable.id, planId));
  if (!plan || !plan.isActive) {
    res.status(400).json({ error: "Invalid or inactive plan" });
    return;
  }

  // Enforce fixed amount if the plan has one; otherwise use user-submitted amount
  const amount = plan.fixedAmount ? Number(plan.fixedAmount) : parsed.data.amount;

  // Check platform-level minimum deposit
  const [minDepositRow] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "min_deposit_amount"));
  const platformMinDeposit = Number(minDepositRow?.value ?? 0);
  if (platformMinDeposit > 0 && amount < platformMinDeposit) {
    res.status(400).json({ error: `Minimum deposit is KSH ${platformMinDeposit}` });
    return;
  }

  // Plan-level amount checks (only applies when no fixedAmount)
  if (!plan.fixedAmount) {
    if (amount < Number(plan.minAmount)) {
      res.status(400).json({ error: `Minimum deposit for this plan is KSH ${plan.minAmount}` });
      return;
    }
    if (plan.maxAmount && amount > Number(plan.maxAmount)) {
      res.status(400).json({ error: `Maximum deposit for this plan is KSH ${plan.maxAmount}` });
      return;
    }
  }

  // Fetch user to get real email and registered phone for Paystack
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Always use the user's registered phone — not a user-submitted value
  const phone = user.mpesaPhone || user.phone;

  const bonusAmount = (amount * Number(plan.bonusPercent)) / 100;
  const dailyEarning = amount * Number(plan.dailyRate);
  const reference = `EKE-${Date.now()}-${userId}`;

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET) {
    res.status(503).json({ error: "Payment service not configured. Please contact support." });
    return;
  }

  const formattedPhone = formatPhoneForPaystack(phone);

  let paystackData: { status: boolean; data?: { status: string; reference: string; authorization_url?: string } };
  try {
    const paystackRes = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amount * 100,
        reference,
        currency: "KES",
        mobile_money: { phone: formattedPhone, provider: "mpesa" },
      }),
    });

    paystackData = (await paystackRes.json()) as typeof paystackData;
    if (!paystackData.status) {
      req.log.error({ paystackData }, "Paystack charge initiation failed");
      res.status(502).json({ error: "Failed to initiate payment. Please try again." });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "Paystack charge request threw");
    res.status(502).json({ error: "Payment service unreachable. Please try again." });
    return;
  }

  const [deposit] = await db
    .insert(depositsTable)
    .values({
      userId,
      planId,
      amount: amount.toString(),
      bonusAmount: bonusAmount.toString(),
      dailyEarning: dailyEarning.toString(),
      status: "pending",
      autoRenew,
      paystackRef: reference,
    })
    .returning();

  const authUrl = paystackData.data?.authorization_url ?? null;
  res.status(201).json({
    ...formatDeposit(deposit, plan.name),
    paystackAuthUrl: authUrl,
    reference,
  });
});

router.post(
  "/deposits/verify",
  authenticate,
  async (req, res): Promise<void> => {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const parsed = VerifyDepositBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { reference } = parsed.data;

    const [deposit] = await db
      .select()
      .from(depositsTable)
      .where(and(eq(depositsTable.paystackRef, reference), eq(depositsTable.userId, userId)));
    if (!deposit) {
      res.status(404).json({ error: "Deposit not found" });
      return;
    }
    if (deposit.status === "active") {
      const [plan] = await db.select().from(depositPlansTable).where(eq(depositPlansTable.id, deposit.planId));
      res.json(formatDeposit(deposit, plan?.name ?? "Unknown"));
      return;
    }
    if (deposit.status !== "pending") {
      res.status(400).json({ error: "Deposit is not pending" });
      return;
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      res.status(503).json({ error: "Payment service not configured" });
      return;
    }

    let verifyData: { status: boolean; data?: { status: string } };
    try {
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      });
      verifyData = (await verifyRes.json()) as typeof verifyData;
    } catch (err) {
      req.log.error({ err }, "Paystack verify request threw");
      res.status(502).json({ error: "Payment verification failed. Please try again." });
      return;
    }

    if (!verifyData.status || verifyData.data?.status !== "success") {
      res.status(400).json({
        error: "Payment not confirmed yet",
        paystackStatus: verifyData.data?.status ?? "unknown",
        retryable: true,
      });
      return;
    }

    const startsAt = new Date();
    const [plan] = await db.select().from(depositPlansTable).where(eq(depositPlansTable.id, deposit.planId));
    const durationDays = plan?.durationDays ?? 30;
    const endsAt = new Date(startsAt.getTime() + durationDays * 86400000);

    // Atomic transition: only succeeds if deposit is STILL pending (prevents double-credit on concurrent requests)
    const activated = await db
      .update(depositsTable)
      .set({ status: "active", startsAt, endsAt })
      .where(and(eq(depositsTable.id, deposit.id), eq(depositsTable.status, "pending")))
      .returning();

    if (activated.length === 0) {
      // Another request already activated this deposit — return the current state idempotently
      const [latest] = await db.select().from(depositsTable).where(eq(depositsTable.id, deposit.id));
      res.json(formatDeposit(latest ?? deposit, plan?.name ?? "Unknown"));
      return;
    }

    const updated = activated[0];

    // Credit bonus amount to user balance
    const depositAmount = Number(deposit.amount);
    const bonusAmt = Number(deposit.bonusAmount);

    // Update user totalDeposited and recalc VIP
    const [userBefore] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const newTotal = Number(userBefore?.totalDeposited ?? 0) + depositAmount;

    // Get VIP thresholds from platform settings
    const settingsRows = await db.select().from(platformSettingsTable);
    const getSetting = (key: string, def: number) =>
      Number(settingsRows.find((r) => r.key === key)?.value ?? def);
    const silverMin = getSetting("vip_silver_min", 5000);
    const goldMin = getSetting("vip_gold_min", 20000);
    const platinumMin = getSetting("vip_platinum_min", 100000);

    let vipLevel: string = userBefore?.vipLevel ?? "bronze";
    if (newTotal >= platinumMin) vipLevel = "platinum";
    else if (newTotal >= goldMin) vipLevel = "gold";
    else if (newTotal >= silverMin) vipLevel = "silver";
    else vipLevel = "bronze";

    const newBalance = Number(userBefore?.balance ?? 0) + bonusAmt;
    await db
      .update(usersTable)
      .set({
        totalDeposited: newTotal.toString(),
        balance: newBalance.toString(),
        vipLevel,
      })
      .where(eq(usersTable.id, userId));

    // Insert bonus earning record
    if (bonusAmt > 0) {
      await db.insert(earningsTable).values({
        userId,
        amount: bonusAmt.toString(),
        type: "bonus",
        description: `Deposit bonus for ${plan?.name ?? "plan"}`,
      });
    }

    // Distribute referral bonuses
    try {
      const referrals = await db
        .select()
        .from(referralsTable)
        .where(eq(referralsTable.referredId, userId));

      for (const ref of referrals) {
        const pctKey = `referral_bonus_l${ref.level}_percent`;
        const pct = getSetting(pctKey, ref.level === 1 ? 5 : ref.level === 2 ? 3 : 1);
        const bonusForRef = (depositAmount * pct) / 100;
        if (bonusForRef <= 0) continue;

        await db.update(usersTable).set({
          balance: (Number((await db.select().from(usersTable).where(eq(usersTable.id, ref.referrerId)).then((r) => r[0]?.balance ?? 0))) + bonusForRef).toString(),
        }).where(eq(usersTable.id, ref.referrerId));

        await db.update(referralsTable)
          .set({ bonusAmount: (Number(ref.bonusAmount) + bonusForRef).toString() })
          .where(eq(referralsTable.id, ref.id));

        await db.insert(earningsTable).values({
          userId: ref.referrerId,
          amount: bonusForRef.toString(),
          type: "referral_bonus",
          description: `Level ${ref.level} referral bonus`,
        });
      }
    } catch (refErr) {
      req.log.warn({ refErr }, "Failed to distribute referral bonuses");
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const planName = plan?.name ?? "Unknown";
    const depositAmountFormatted = Number(deposit.amount).toLocaleString("en-KE");
    const dailyEarningFormatted = Number(deposit.dailyEarning).toLocaleString("en-KE");
    const confirmationMessage =
      `Your deposit of KSH ${depositAmountFormatted} under the ${planName} plan has been activated successfully. ` +
      `You will earn KSH ${dailyEarningFormatted} per day. ` +
      `Reference: ${deposit.paystackRef}. ` +
      `Contact support with this reference if you have any questions.`;

    db.insert(inboxMessagesTable)
      .values({ userId, title: "Deposit Confirmed", content: confirmationMessage })
      .catch((err: unknown) => req.log.error({ err }, "Failed to send deposit inbox notification"));

    if (user) {
      sendDepositConfirmationEmail({ to: user.email, name: user.name, message: confirmationMessage }).catch(
        (err: unknown) => req.log.error({ err }, "Failed to send deposit confirmation email"),
      );
    }

    res.json(formatDeposit(updated, planName));
  },
);

router.delete("/deposits/:id", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const depositId = parseInt(req.params.id as string, 10);
  if (isNaN(depositId)) {
    res.status(400).json({ error: "Invalid deposit ID" });
    return;
  }

  const [deposit] = await db
    .select()
    .from(depositsTable)
    .where(and(eq(depositsTable.id, depositId), eq(depositsTable.userId, userId)));

  if (!deposit) {
    res.status(404).json({ error: "Deposit not found" });
    return;
  }
  if (deposit.status !== "pending") {
    res.status(400).json({ error: "Only pending deposits can be cancelled" });
    return;
  }

  await db.update(depositsTable).set({ status: "cancelled" }).where(eq(depositsTable.id, depositId));
  res.json({ success: true, message: "Deposit cancelled" });
});

export default router;
