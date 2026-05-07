import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db, usersTable, inboxMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody, AdminLoginBody } from "@workspace/api-zod";
import { signToken, authenticate } from "../middlewares/auth";
import type { JwtPayload } from "../middlewares/auth";
import { loginHistoryTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  sendWelcomeEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from "../mailer";

const router: IRouter = Router();

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
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

// ─── Register ────────────────────────────────────────────────────────────────
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
  const verificationToken = generateToken();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  let referredBy: number | null = null;
  if (referralCode) {
    const [referrer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.referralCode, referralCode));
    if (referrer) {
      referredBy = referrer.id;
    }
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      phone,
      passwordHash,
      referralCode: newReferralCode,
      referredBy: referredBy ?? undefined,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    })
    .returning();

  if (referredBy) {
    const { referralsTable } = await import("@workspace/db");
    await db
      .insert(referralsTable)
      .values({ referrerId: referredBy, referredId: user.id, level: 1, bonusAmount: "0" });

    const [referrer2] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, referredBy));
    if (referrer2?.referredBy) {
      await db.insert(referralsTable).values({
        referrerId: referrer2.referredBy,
        referredId: user.id,
        level: 2,
        bonusAmount: "0",
      });
    }
  }

  sendEmailVerificationEmail(user.email, user.name, verificationToken).catch((err: unknown) => {
    logger.warn({ err, userId: user.id }, "Failed to send email verification");
  });

  res.status(201).json({
    message: "Account created. Please check your email to verify your address before logging in.",
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────
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

  if (!user.emailVerified && !user.isAdmin) {
    res.status(403).json({
      error: "Please verify your email address before logging in.",
      needsVerification: true,
    });
    return;
  }

  await db.insert(loginHistoryTable).values({ userId: user.id, ip: req.ip });

  const token = signToken({ userId: user.id, isAdmin: user.isAdmin });
  res.json({ user: formatUser(user), token });
});

// ─── Verify Email ─────────────────────────────────────────────────────────────
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Verification token is required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.emailVerificationToken, token));

  if (!user) {
    res.status(400).json({ error: "Invalid or already-used verification link." });
    return;
  }

  if (user.emailVerified) {
    const jwt = signToken({ userId: user.id, isAdmin: user.isAdmin });
    res.json({ user: formatUser(user), token: jwt });
    return;
  }

  if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
    res.status(400).json({ error: "Verification link has expired. Please request a new one." });
    return;
  }

  await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null })
    .where(eq(usersTable.id, user.id));

  sendWelcomeEmail(user.email, user.name).catch((err: unknown) => {
    logger.warn({ err, userId: user.id }, "Failed to send welcome email after verification");
  });

  db.insert(inboxMessagesTable)
    .values({
      userId: user.id,
      title: "Welcome to ElevateKe!",
      content: `Hi ${user.name},

Welcome to ElevateKe — your Kenyan platform for daily investment earnings!

Here's how to get started in 3 simple steps:

1. Make your first deposit via M-Pesa STK Push (as little as KSH 500)
2. Choose an investment plan and start earning daily returns
3. Claim your earnings every day — they accumulate automatically

The more you invest, the higher your VIP tier and daily earning rate.

We're excited to have you on board. Head to your Deposit page to get started.

— The ElevateKe Team`,
    })
    .catch((err: unknown) => {
      logger.warn({ err, userId: user.id }, "Failed to send welcome inbox message");
    });

  const jwt = signToken({ userId: user.id, isAdmin: user.isAdmin });
  res.json({ user: formatUser(user), token: jwt });
});

// ─── Resend Verification Email ────────────────────────────────────────────────
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.json({ message: "If that email exists, a verification link has been sent." });
    return;
  }

  if (user.emailVerified) {
    res.status(400).json({ error: "This email address is already verified. Please log in." });
    return;
  }

  const newToken = generateToken();
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(usersTable)
    .set({ emailVerificationToken: newToken, emailVerificationExpires: newExpires })
    .where(eq(usersTable.id, user.id));

  sendEmailVerificationEmail(user.email, user.name, newToken).catch((err: unknown) => {
    logger.warn({ err, userId: user.id }, "Failed to resend verification email");
  });

  res.json({ message: "If that email exists, a verification link has been sent." });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  // Always return the same response to prevent user enumeration
  res.json({ message: "If an account with that email exists, a reset link has been sent." });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || user.isAdmin) return;

  const resetToken = generateToken();
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db
    .update(usersTable)
    .set({ passwordResetToken: resetToken, passwordResetExpires: resetExpires })
    .where(eq(usersTable.id, user.id));

  sendPasswordResetEmail(user.email, user.name, resetToken).catch((err: unknown) => {
    logger.warn({ err, userId: user.id }, "Failed to send password reset email");
  });
});

// ─── Reset Password ───────────────────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Reset token is required." });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.passwordResetToken, token));

  if (!user) {
    res.status(400).json({ error: "Invalid or already-used reset link." });
    return;
  }

  if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
    res.status(400).json({ error: "Reset link has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db
    .update(usersTable)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      emailVerified: true, // If they can receive email, the address is valid
    })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "Password updated successfully. You can now log in." });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true, message: "Logged out" });
});

// ─── Get Current User ─────────────────────────────────────────────────────────
router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const { userId } = (req as typeof req & { user: JwtPayload }).user;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

// ─── Admin Login ──────────────────────────────────────────────────────────────
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
    [adminUser] = await db
      .insert(usersTable)
      .values({
        name: "Admin",
        email: `${username}@elevateke.admin`,
        phone: "0000000000",
        passwordHash: hash,
        referralCode: "ADMIN001",
        isAdmin: true,
        emailVerified: true,
      })
      .returning();
  }

  const token = signToken({ userId: adminUser.id, isAdmin: true });
  res.json({ user: formatUser(adminUser), token });
});

export default router;
