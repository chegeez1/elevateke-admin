import { db, usersTable, inboxMessagesTable } from "@workspace/db";
import { isNull, isNotNull, lt, eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendDepositReminderEmail } from "../mailer";

const REMINDER1_TITLE = "Don't miss out — fund your ElevateKe account!";

const REMINDER1_CONTENT = `Hi there,

We noticed you haven't made your first deposit yet. Your ElevateKe account is ready — all you need to do is fund it and start earning!

Here's what you'll unlock once you deposit:
• Daily returns of up to 5% depending on your investment plan
• Bonus earnings from our referral program  
• VIP tier upgrades with higher daily earning rates

Getting started takes less than 2 minutes via M-Pesa STK Push.

Head to your Deposit page to get started: /deposit

Choose a plan that suits you and start growing your money today.

If you have any questions, our support team is happy to help — just reply to this message.

— The ElevateKe Team`;

const REMINDER2_TITLE = "Your account is waiting — here's what you're missing";

const REMINDER3_TITLE = "Last chance — a welcome bonus is waiting for you";

const REMINDER3_CONTENT = `Hi there,

It's been a week since you joined ElevateKe, and we don't want you to miss out entirely.

As a one-time welcome offer, we're giving you an extra 5% bonus on your first deposit — but this is the last time we'll reach out automatically.

Here's what's waiting for you the moment you fund your account:
• Daily returns credited automatically — no action needed
• VIP rewards that grow your earning rate over time
• Referral income from every person you invite
• M-Pesa withdrawals whenever you need access to your money

Thousands of Kenyans are already building real savings on ElevateKe every day.

If you've been thinking about it — now is the time. Head to your Deposit page to get started: /deposit

After this, we'll let you enjoy your inbox in peace.

— The ElevateKe Team`;

const REMINDER2_CONTENT = `Hi there,

It's been 3 days since you joined ElevateKe, and your account is still waiting to be activated.

Every day without a deposit is a day without earnings. Here's what others like you are already enjoying:

• Steady daily returns deposited straight to your balance
• A growing VIP level that unlocks higher rates
• Referral bonuses every time someone you invite invests

Your money works hardest when it starts early — the sooner you deposit, the sooner compounding kicks in.

Getting started takes less than 2 minutes via M-Pesa STK Push. Head to your Deposit page now: /deposit

Don't let another day go by — your future self will thank you.

— The ElevateKe Team`;

export async function sendDepositReminders(): Promise<void> {
  await sendFirstReminders();
  await sendSecondReminders();
  await sendThirdReminders();
}

async function sendFirstReminders(): Promise<void> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const undeposited = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isAdmin, false),
        eq(usersTable.isSuspended, false),
        lt(usersTable.createdAt, twentyFourHoursAgo),
        isNull(usersTable.depositReminderSentAt),
        sql`${usersTable.totalDeposited} = 0`,
      ),
    );

  if (undeposited.length === 0) return;

  logger.info({ count: undeposited.length }, "Sending first deposit reminder messages");

  for (const user of undeposited) {
    try {
      await db.insert(inboxMessagesTable).values({
        userId: user.id,
        title: REMINDER1_TITLE,
        content: REMINDER1_CONTENT,
      });

      await db
        .update(usersTable)
        .set({ depositReminderSentAt: new Date() })
        .where(eq(usersTable.id, user.id));

      sendDepositReminderEmail(user.email, 1).catch((err: unknown) =>
        logger.warn({ err, userId: user.id }, "Failed to send first deposit reminder email"),
      );

      logger.info({ userId: user.id }, "First deposit reminder sent");
    } catch (err) {
      logger.error({ err, userId: user.id }, "Failed to send first deposit reminder for user");
    }
  }
}

async function sendSecondReminders(): Promise<void> {
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const undeposited = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isAdmin, false),
        eq(usersTable.isSuspended, false),
        lt(usersTable.createdAt, seventyTwoHoursAgo),
        isNull(usersTable.depositReminder2SentAt),
        sql`${usersTable.totalDeposited} = 0`,
      ),
    );

  if (undeposited.length === 0) return;

  logger.info({ count: undeposited.length }, "Sending second deposit reminder messages");

  for (const user of undeposited) {
    try {
      await db.insert(inboxMessagesTable).values({
        userId: user.id,
        title: REMINDER2_TITLE,
        content: REMINDER2_CONTENT,
      });

      await db
        .update(usersTable)
        .set({ depositReminder2SentAt: new Date() })
        .where(eq(usersTable.id, user.id));

      sendDepositReminderEmail(user.email, 2).catch((err: unknown) =>
        logger.warn({ err, userId: user.id }, "Failed to send second deposit reminder email"),
      );

      logger.info({ userId: user.id }, "Second deposit reminder sent");
    } catch (err) {
      logger.error({ err, userId: user.id }, "Failed to send second deposit reminder for user");
    }
  }
}

async function sendThirdReminders(): Promise<void> {
  const oneHundredSixtyEightHoursAgo = new Date(Date.now() - 168 * 60 * 60 * 1000);

  const undeposited = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isAdmin, false),
        eq(usersTable.isSuspended, false),
        lt(usersTable.createdAt, oneHundredSixtyEightHoursAgo),
        isNotNull(usersTable.depositReminder2SentAt),
        isNull(usersTable.depositReminder3SentAt),
        sql`${usersTable.totalDeposited} = 0`,
      ),
    );

  if (undeposited.length === 0) return;

  logger.info({ count: undeposited.length }, "Sending third deposit reminder messages");

  for (const user of undeposited) {
    try {
      await db.insert(inboxMessagesTable).values({
        userId: user.id,
        title: REMINDER3_TITLE,
        content: REMINDER3_CONTENT,
      });

      await db
        .update(usersTable)
        .set({ depositReminder3SentAt: new Date() })
        .where(eq(usersTable.id, user.id));

      sendDepositReminderEmail(user.email, 3).catch((err: unknown) =>
        logger.warn({ err, userId: user.id }, "Failed to send third deposit reminder email"),
      );

      logger.info({ userId: user.id }, "Third deposit reminder sent");
    } catch (err) {
      logger.error({ err, userId: user.id }, "Failed to send third deposit reminder for user");
    }
  }
}
