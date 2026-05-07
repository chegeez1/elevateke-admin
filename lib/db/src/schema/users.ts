import { pgTable, text, serial, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  mpesaPhone: text("mpesa_phone"),
  passwordHash: text("password_hash").notNull(),
  pinHash: text("pin_hash"),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: integer("referred_by"),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  totalEarned: numeric("total_earned", { precision: 15, scale: 2 }).notNull().default("0"),
  totalDeposited: numeric("total_deposited", { precision: 15, scale: 2 }).notNull().default("0"),
  vipLevel: text("vip_level").notNull().default("Bronze"),
  language: text("language").notNull().default("en"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),

  // ── Email verification ───────────────────────────────────────────────────
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires", { withTimezone: true }),

  // ── Password reset ───────────────────────────────────────────────────────
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires", { withTimezone: true }),

  loginBonusClaimedAt: timestamp("login_bonus_claimed_at", { withTimezone: true }),
  depositReminderSentAt: timestamp("deposit_reminder_sent_at", { withTimezone: true }),
  depositReminder2SentAt: timestamp("deposit_reminder2_sent_at", { withTimezone: true }),
  depositReminder3SentAt: timestamp("deposit_reminder3_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
