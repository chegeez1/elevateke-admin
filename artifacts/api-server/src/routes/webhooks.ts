import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  db,
  depositsTable,
  depositPlansTable,
  usersTable,
  inboxMessagesTable,
} from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { sendDepositConfirmationEmail, sendDepositFailedEmail } from "../mailer";

const router: IRouter = Router();

router.post(
  "/",
  async (req, res): Promise<void> => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      req.log.error("PAYSTACK_SECRET_KEY not configured — webhook rejected");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    const signature = req.headers["x-paystack-signature"] as string | undefined;
    if (!signature) {
      req.log.warn("Paystack webhook received without signature header");
      res.status(400).json({ error: "Missing signature" });
      return;
    }

    const rawBody: Buffer = req.body as Buffer;
    const expected = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    const valid =
      sigBuf.length === expBuf.length &&
      crypto.timingSafeEqual(sigBuf, expBuf);

    if (!valid) {
      req.log.warn("Paystack webhook signature mismatch");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    let event: { event?: string; data?: { reference?: string; status?: string } };
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      req.log.warn("Paystack webhook body is not valid JSON");
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    // ── charge.failed ──────────────────────────────────────────────────────────
    if (event.event === "charge.failed") {
      const reference = event.data?.reference;
      if (!reference) {
        req.log.warn({ event }, "charge.failed event missing reference");
        res.status(200).json({ received: true });
        return;
      }

      req.log.info({ reference }, "Processing charge.failed webhook");

      const [failedDeposit] = await db
        .select()
        .from(depositsTable)
        .where(and(
          eq(depositsTable.paystackRef, reference),
          eq(depositsTable.status, "pending"),
        ));

      if (!failedDeposit) {
        req.log.info({ reference }, "No pending deposit found for charge.failed — ignoring");
        res.status(200).json({ received: true });
        return;
      }

      const [markedFailed] = await db
        .update(depositsTable)
        .set({ status: "failed" })
        .where(and(
          eq(depositsTable.id, failedDeposit.id),
          eq(depositsTable.status, "pending"),
        ))
        .returning();

      if (!markedFailed) {
        // Status changed between our SELECT and UPDATE (race with success webhook or verify endpoint)
        req.log.info({ reference, depositId: failedDeposit.id }, "Deposit status changed concurrently — skipping failed notification");
        res.status(200).json({ received: true });
        return;
      }

      const depositAmtFmt = Number(failedDeposit.amount).toLocaleString("en-KE");
      db.insert(inboxMessagesTable)
        .values({
          userId: failedDeposit.userId,
          title: "Payment Failed",
          content:
            `Your M-Pesa payment of KSH ${depositAmtFmt} could not be processed ` +
            `(Ref: ${reference}). This can happen if the STK Push was declined, timed out, ` +
            `or the PIN was entered incorrectly. Please go to the Deposit page and try again. ` +
            `If funds were deducted from your M-Pesa, contact support with the reference above.`,
        })
        .catch((err: unknown) =>
          req.log.error({ err }, "Webhook: failed to send payment-failed inbox notification"),
        );

      const [failedUser] = await db.select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, failedDeposit.userId));
      if (failedUser) {
        sendDepositFailedEmail(failedUser.email, failedUser.name).catch((err: unknown) =>
          req.log.error({ err }, "Webhook: failed to send deposit-failed email"),
        );
      }

      req.log.info({ reference, depositId: failedDeposit.id }, "Deposit marked failed via webhook");
      res.status(200).json({ received: true });
      return;
    }

    // ── unhandled events ───────────────────────────────────────────────────────
    if (event.event !== "charge.success") {
      res.status(200).json({ received: true });
      return;
    }

    const reference = event.data?.reference;
    if (!reference) {
      req.log.warn({ event }, "charge.success event missing reference");
      res.status(200).json({ received: true });
      return;
    }

    req.log.info({ reference }, "Processing charge.success webhook");

    const [deposit] = await db
      .select()
      .from(depositsTable)
      .where(eq(depositsTable.paystackRef, reference));

    if (!deposit) {
      req.log.warn({ reference }, "No deposit found for webhook reference");
      res.status(200).json({ received: true });
      return;
    }

    if (deposit.status === "active") {
      req.log.info({ reference }, "Deposit already active — skipping");
      res.status(200).json({ received: true });
      return;
    }

    if (deposit.status === "cancelled") {
      req.log.warn({ reference }, "Deposit was cancelled — skipping activation");
      res.status(200).json({ received: true });
      return;
    }

    // Allow both `pending` and `expired` deposits to be activated via webhook.
    // A deposit may be marked expired by the cleanup job before Paystack delivers
    // the webhook — Paystack's confirmation of payment takes precedence.
    if (deposit.status !== "pending" && deposit.status !== "expired") {
      req.log.warn({ reference, status: deposit.status }, "Deposit in unexpected state — skipping");
      res.status(200).json({ received: true });
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

    const [activated] = await db
      .update(depositsTable)
      .set({ status: "active", startsAt: now, endsAt, lastEarningAt: now })
      .where(and(
        eq(depositsTable.id, deposit.id),
        or(eq(depositsTable.status, "pending"), eq(depositsTable.status, "expired")),
      ))
      .returning();

    if (!activated) {
      // No row was updated — deposit was already activated or status changed
      // concurrently (race with cleanup job or duplicate webhook delivery).
      req.log.info({ reference, depositId: deposit.id, currentStatus: deposit.status },
        "Deposit transition to active was a no-op — skipping user credit");
      res.status(200).json({ received: true });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, deposit.userId));

    const newDeposited =
      Number(user?.totalDeposited ?? 0) +
      Number(deposit.amount) +
      Number(deposit.bonusAmount);
    const newBalance = Number(user?.balance ?? 0) + Number(deposit.bonusAmount);

    let vipLevel = "Bronze";
    if (newDeposited >= 50000) vipLevel = "Platinum";
    else if (newDeposited >= 20000) vipLevel = "Gold";
    else if (newDeposited >= 5000) vipLevel = "Silver";

    await db
      .update(usersTable)
      .set({
        totalDeposited: newDeposited.toString(),
        balance: newBalance.toString(),
        vipLevel,
      })
      .where(eq(usersTable.id, deposit.userId));

    const planName = plan?.name ?? "Unknown";
    const depositAmount = Number(deposit.amount).toLocaleString("en-KE");
    const dailyEarning = Number(deposit.dailyEarning).toLocaleString("en-KE");
    const confirmationMessage =
      `Your deposit of KSH ${depositAmount} under the ${planName} plan has been activated successfully. ` +
      `You will earn KSH ${dailyEarning} per day. ` +
      `Reference: ${deposit.paystackRef}. ` +
      `Contact support with this reference if you have any questions.`;

    db.insert(inboxMessagesTable)
      .values({ userId: deposit.userId, title: "Deposit Confirmed", content: confirmationMessage })
      .catch((err: unknown) =>
        req.log.error({ err }, "Webhook: failed to send deposit inbox notification"),
      );

    if (user) {
      sendDepositConfirmationEmail({
        to: user.email,
        name: user.name,
        message: confirmationMessage,
        amount: Number(deposit.amount),
        planName,
      }).catch((err: unknown) =>
        req.log.error({ err }, "Webhook: failed to send deposit confirmation email"),
      );
    }

    req.log.info({ reference, depositId: deposit.id }, "Deposit auto-activated via webhook");
    res.status(200).json({ received: true });
  },
);

export default router;
