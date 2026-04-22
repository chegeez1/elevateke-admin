import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { db, usersTable, inboxMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody, AdminLoginBody } from "@workspace/api-zod";
import { signToken, authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { loginHistoryTable } from "@workspace/db";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { sendWelcomeEmail } from "../mailer";

const router: IRouter = Router();

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    balance: Number(user.balance),
    totalEarned: Number(user.totalEarned),
    totalDeposited: Number(user.totalDeposited),
    vipLevel: user.vipLevel,
    referralCode: user.referralCode,
    isAdmin: user.isAdmin,
    isSuspended: user.isSuspended,
    loginBonusClaimedAt: user.loginBonusClaimedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, phone, password, referralCode } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newReferralCode = generateReferralCode();

  let referredBy: number | null = null;
  if (referralCode) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode));
    if (referrer) {
      referredBy = referrer.id;
    }
  }

  const [user] = await db.insert(usersTable).values({
    name,
    email,
    phone,
    passwordHash,
    referralCode: newReferralCode,
    referredBy: referredBy ?? undefined,
  }).returning();

  if (referredBy) {
    const { referralsTable } = await import("@workspace/db");
    await db.insert(referralsTable).values({ referrerId: referredBy, referredId: user.id, level: 1, bonusAmount: "0" });

    const [referrer2] = await db.select().from(usersTable).where(eq(usersTable.id, referredBy));
    if (referrer2?.referredBy) {
      await db.insert(referralsTable).values({ referrerId: referrer2.referredBy, referredId: user.id, level: 2, bonusAmount: "0" });
    }
  }

  sendWelcomeEmail(user.email, user.name).catch((err: unknown) => {
    logger.warn({ err, userId: user.id }, "Failed to send welcome email");
  });

  db.insert(inboxMessagesTable).values({
    userId: user.id,
    title: "Welcome to ElevateKe!",
    content: `Hi ${name},

Welcome to ElevateKe — your Kenyan platform for daily investment earnings!

Here's how to get started in 3 simple steps:

1. Make your first deposit via M-Pesa STK Push (as little as KSH 500)
2. Choose an investment plan and start earning daily returns
3. Claim your earnings every day — they accumulate automatically

The more you invest, the higher your VIP tier and daily earning rate.

We're excited to have you on board. Head to your Deposit page to get started: /deposit

If you have any questions, our team is here to help.

— The ElevateKe Team`,
  }).catch((err: unknown) => {
    logger.warn({ err, userId: user.id }, "Failed to send welcome inbox message");
  });

  const token = signToken({ userId: user.id, isAdmin: user.isAdmin });
  res.status(201).json({ user: formatUser(user), token });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (user.isSuspended) {
    res.status(401).json({ error: "Account suspended. Contact support." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await db.insert(loginHistoryTable).values({ userId: user.id, ip: req.ip });

  const token = signToken({ userId: user.id, isAdmin: user.isAdmin });
  res.json({ user: formatUser(user), token });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true, message: "Logged out" });
});

router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

router.post("/auth/admin-login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, password } = parsed.data;

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }

  let [adminUser] = await db.select().from(usersTable).where(eq(usersTable.isAdmin, true));
  if (!adminUser) {
    const hash = await bcrypt.hash(password, 10);
    [adminUser] = await db.insert(usersTable).values({
      name: "Admin",
      email: `${username}@elevateke.admin`,
      phone: "0000000000",
      passwordHash: hash,
      referralCode: "ADMIN001",
      isAdmin: true,
    }).returning();
  }

  const token = signToken({ userId: adminUser.id, isAdmin: true });
  res.json({ user: formatUser(adminUser), token });
});

export default router;
