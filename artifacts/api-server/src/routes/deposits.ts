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
    const where = userId !== undefined
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
      expiresAt: d.status === "pending"
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
      .select({
        deposit: depositsTable,
        planName: depositPlansTable.name,
      })
      .from(depositsTable)
      .leftJoin(depositPlansTable, eq(depositsTable.planId, depositPlansTable.id))
      .where(eq(depositsTable.userId, userId))
      .orderBy(desc(depositsTable.createdAt));
    res.json(
      deposits.map(({ deposit, planName }) =>
        formatDeposit(deposit, planName ?? "Unknown"),
      ),
    );
  });

  router.post("/deposits", authenticate, async (req, res): Promise<void> => {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const parsed = CreateDepositBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { planId, amount, phone } = parsed.data;
    const autoRenew = parsed.data.autoRenew ?? false;

    const [plan] = await db
      .select()
      .from(depositPlansTable)
      .where(eq(depositPlansTable.id, planId));
    if (!plan || !plan.isActive) {
      res.status(400).json({ error: "Invalid or inactive plan" });
      return;
    }
    if (amount < Number(plan.minAmount)) {
      res.status(400).json({ error: `Minimum deposit is KSH ${plan.minAmount}` });
      return;
    }
    if (plan.maxAmount && amount > Number(plan.maxAmount)) {
      res.status(400).json({ error: `Maximum deposit is KSH ${plan.maxAmount}` });
      return;
    }

    // Fetch user to get real email for Paystack
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bonusAmount = (amount * Number(plan.bonusPercent)) / 100;
    const dailyEarning = amount * Number(plan.dailyRate);
    const reference = `EKE-${Date.now()}-${userId}`;

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      res.status(503).json({ error: "Payment service not configured. Please contact support." });
      return;
    }

    const formattedPhone = formatPhoneForPaystack(phone);

    try {
      const paystackRes = await fetch(
        "https://api.paystack.co/charge",
        {
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
            mobile_money: {
              phone: formattedPhone,
              provider: "mpesa",
            },
          }),
        },
      );
      const paystackData = (await paystackRes.json()) as {
        status?: boolean;
        data?: { status?: string; reference?: string };
        message?: string;
      };

      if (!paystackData.status) {
        req.log.error({ paystackData }, "Paystack charge initialization failed");
        res.status(502).json({ error: paystackData.message || "Failed to initiate M-Pesa payment. Please check your phone number and try again." });
        return;
      }

      const chargeStatus = paystackData.data?.status ?? "";
      if (chargeStatus === "failed") {
        req.log.error({ paystackData }, "Paystack charge returned failed status");
        res.status(502).json({ error: "M-Pesa payment initiation failed. Please verify your phone number and try again." });
        return;
      }

      // Accepted statuses: pay_offline (STK push sent), pending, send_otp
      req.log.info({ chargeStatus, reference }, "Paystack M-Pesa charge initiated");
    } catch (err) {
      req.log.error({ err }, "Paystack charge call failed");
      res.status(502).json({ error: "Payment service unavailable. Please try again later." });
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
        paystackRef: reference,
        autoRenew,
      })
      .returning();

    res.status(201).json({
      deposit: formatDeposit(deposit, plan.name),
      paystackAuthUrl: "",
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
      await expireStalePendingDeposits(userId);

      const [deposit] = await db
        .select()
        .from(depositsTable)
        .where(
          and(
            eq(depositsTable.paystackRef, reference),
            eq(depositsTable.userId, userId),
          ),
        );

      if (!deposit) {
        res.status(404).json({ error: "Deposit not found" });
        return;
      }
      if (deposit.status === "active") {
        const [plan] = await db
          .select()
          .from(depositPlansTable)
          .where(eq(depositPlansTable.id, deposit.planId));
        res.json(formatDeposit(deposit, plan?.name ?? "Unknown"));
        return;
      }

      const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
      if (!PAYSTACK_SECRET) {
        res.status(503).json({ error: "Payment service not configured. Please contact support." });
        return;
      }

      if (deposit.status === "expired" || deposit.status === "cancelled") {
        let alreadyPaid = false;
        if (deposit.paystackRef) {
          try {
            const checkRes = await fetch(
              `https://api.paystack.co/transaction/verify/${deposit.paystackRef}`,
              { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
            );
            const checkData = (await checkRes.json()) as { data?: { status?: string } };
            alreadyPaid = checkData?.data?.status === "success";
            if (alreadyPaid) {
              req.log.info({ depositId: deposit.id, prevStatus: deposit.status },
                "Reconciling deposit — payment found");
              await db.update(depositsTable)
                .set({ status: "pending" })
                .where(eq(depositsTable.id, deposit.id));
              deposit.status = "pending";
            }
          } catch (e) {
            req.log.warn({ err: e }, "Paystack check during reconciliation failed");
          }
        }
        if (!alreadyPaid) {
          if (deposit.status === "expired") {
            res.status(410).json({
              error: `This payment request has expired (${EXPIRE_AFTER_MINUTES} minute limit). Please start a new deposit.`,
              expired: true,
            });
            return;
          }
          res.status(400).json({ error: "This deposit was cancelled. Please start a new deposit." });
          return;
        }
      }

      let verified = false;
      try {
        const verRes = await fetch(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
          },
        );
        const verData = (await verRes.json()) as { data?: { status?: string } };
        verified = verData?.data?.status === "success";
      } catch (err) {
        req.log.error({ err }, "Paystack verify call failed");
        res.status(502).json({ error: "Payment service unavailable. Please try again later." });
        return;
      }

      if (!verified) {
        res.status(400).json({
          error: "Payment not yet received. Please complete the M-Pesa prompt on your phone and try again in a few seconds.",
          retryable: true,
        });
        return;
      }

      const now = new Date();
      const [plan] = await db
        .select()
        .from(depositPlansTable)
        .where(eq(depositPlansTable.id, deposit.planId));
      const endsAt = new Date(
        now.getTime() + (plan?.durationDays ?? 30) * 24 * 60 * 60 * 1000,
      );

      const [updated] = await db
        .update(depositsTable)
        .set({
          status: "active",
          startsAt: now,
          endsAt,
          lastEarningAt: now,
        })
        .where(eq(depositsTable.id, deposit.id))
        .returning();

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      const newDeposited =
        Number(user?.totalDeposited ?? 0) +
        Number(deposit.amount) +
        Number(deposit.bonusAmount);
      const newBalance = Number(user?.balance ?? 0) + Number(deposit.bonusAmount);

      const vipSettings = await db.select().from(platformSettingsTable)
        .then(rows => {
          const get = (key: string, def: number) => Number(rows.find(r => r.key === key)?.value ?? def);
          return {
            silver: get("vip_silver_min", 5000),
            gold: get("vip_gold_min", 20000),
            platinum: get("vip_platinum_min", 50000),
          };
        });
      let vipLevel = "Bronze";
      if (newDeposited >= vipSettings.platinum) vipLevel = "Platinum";
      else if (newDeposited >= vipSettings.gold) vipLevel = "Gold";
      else if (newDeposited >= vipSettings.silver) vipLevel = "Silver";

      await db
        .update(usersTable)
        .set({
          totalDeposited: newDeposited.toString(),
          balance: newBalance.toString(),
          vipLevel,
        })
        .where(eq(usersTable.id, userId));

      if (user?.referredBy) {
        const refSettings = await db.select().from(platformSettingsTable)
          .then(rows => {
            const get = (key: string, def: number) => Number(rows.find(r => r.key === key)?.value ?? def);
            return {
              l1: get("referral_bonus_l1_percent", 0),
              l2: get("referral_bonus_l2_percent", 0),
              l3: get("referral_bonus_l3_percent", 0),
            };
          });

        const depositAmount = Number(deposit.amount);

        const creditReferrer = async (referrer: typeof usersTable.$inferSelect, bonus: number, level: number) => {
          await db.update(usersTable).set({
            balance: (Number(referrer.balance) + bonus).toString(),
            totalEarned: (Number(referrer.totalEarned) + bonus).toString(),
          }).where(eq(usersTable.id, referrer.id));
          await db.insert(earningsTable).values({
            userId: referrer.id, amount: bonus.toString(), type: "referral",
            description: `Level ${level} referral bonus from ${user.name}'s deposit`,
          });
        };

        let referrer1: typeof usersTable.$inferSelect | undefined;
        let referrer2: typeof usersTable.$inferSelect | undefined;

        if (refSettings.l1 > 0) {
          const l1Bonus = Math.floor((depositAmount * refSettings.l1) / 100);
          if (l1Bonus > 0) {
            const [r1] = await db.select().from(usersTable).where(eq(usersTable.id, user.referredBy));
            if (r1) {
              referrer1 = r1;
              await creditReferrer(r1, l1Bonus, 1);
              await db.update(referralsTable).set({ bonusAmount: l1Bonus.toString() })
                .where(and(eq(referralsTable.referrerId, r1.id), eq(referralsTable.referredId, userId)));
            }
          }
        } else {
          const [r1] = await db.select().from(usersTable).where(eq(usersTable.id, user.referredBy));
          referrer1 = r1;
        }

        if (refSettings.l2 > 0 && referrer1?.referredBy) {
          const l2Bonus = Math.floor((depositAmount * refSettings.l2) / 100);
          if (l2Bonus > 0) {
            const [r2] = await db.select().from(usersTable).where(eq(usersTable.id, referrer1.referredBy));
            if (r2) {
              referrer2 = r2;
              await creditReferrer(r2, l2Bonus, 2);
            }
          }
        } else if (referrer1?.referredBy) {
          const [r2] = await db.select().from(usersTable).where(eq(usersTable.id, referrer1.referredBy));
          referrer2 = r2;
        }

        if (refSettings.l3 > 0 && referrer2?.referredBy) {
          const l3Bonus = Math.floor((depositAmount * refSettings.l3) / 100);
          if (l3Bonus > 0) {
            const [r3] = await db.select().from(usersTable).where(eq(usersTable.id, referrer2.referredBy));
            if (r3) {
              await creditReferrer(r3, l3Bonus, 3);
            }
          }
        }
      }

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
        sendDepositConfirmationEmail({
          to: user.email,
          name: user.name,
          message: confirmationMessage,
        }).catch((err: unknown) => req.log.error({ err }, "Failed to send deposit confirmation email"));
      }

      res.json(formatDeposit(updated, planName));
    },
  );

  router.delete("/deposits/:id", authenticate, async (req, res): Promise<void> => {
    const { userId } = (req as typeof req & { user: JwtPayload }).user;
    const depositId = parseInt(req.params.id as string, 10);
    if (isNaN(depositId)) { res.status(400).json({ error: "Invalid deposit ID" }); return; }

    const [deposit] = await db.select().from(depositsTable)
      .where(and(eq(depositsTable.id, depositId), eq(depositsTable.userId, userId)));

    if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }
    if (deposit.status !== "pending") {
      res.status(400).json({ error: "Only pending deposits can be cancelled" });
      return;
    }

    await db.update(depositsTable)
      .set({ status: "cancelled" })
      .where(eq(depositsTable.id, depositId));

    res.json({ success: true, message: "Deposit cancelled" });
  });

  export default router;
  