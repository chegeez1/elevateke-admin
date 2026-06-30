import { pgTable, text, serial, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const depositPlansTable = pgTable("deposit_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fixedAmount: numeric("fixed_amount", { precision: 15, scale: 2 }),
  minAmount: numeric("min_amount", { precision: 15, scale: 2 }).notNull(),
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
  dailyRate: numeric("daily_rate", { precision: 5, scale: 4 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  bonusPercent: numeric("bonus_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDepositPlanSchema = createInsertSchema(depositPlansTable).omit({ id: true, createdAt: true });
export type InsertDepositPlan = z.infer<typeof insertDepositPlanSchema>;
export type DepositPlan = typeof depositPlansTable.$inferSelect;
