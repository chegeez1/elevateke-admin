import { db, usersTable, inboxMessagesTable } from "@workspace/db";
import { isNull, lt, eq, and, sql } from "drizzle-orm";
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
