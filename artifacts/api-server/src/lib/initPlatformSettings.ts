import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULTS = [
  { key: "min_deposit_amount", value: "500", label: "Minimum Deposit Amount", description: "Minimum amount a user can deposit (KSH)" },
  { key: "min_withdrawal_amount", value: "1300", label: "Minimum Withdrawal Amount", description: "Minimum amount a user can withdraw per request (KSH)" },
  { key: "max_withdrawal_amount", value: "100000", label: "Maximum Withdrawal Amount", description: "Maximum amount a user can withdraw per request (KSH)" },
  { key: "login_bonus_amount", value: "10", label: "Daily Login Bonus", description: "Amount credited to users who log in each day (KSH)" },
  { key: "signup_bonus_amount", value: "0", label: "Sign-up Bonus", description: "Amount credited to new users on registration (KSH)" },
  { key: "referral_bonus_l1_percent", value: "5", label: "Level 1 Referral Bonus (%)", description: "Bonus percentage on deposit amount for direct referrals" },
  { key: "referral_bonus_l2_percent", value: "3", label: "Level 2 Referral Bonus (%)", description: "Bonus percentage on deposit amount for 2nd-level referrals" },
  { key: "referral_bonus_l3_percent", value: "1", label: "Level 3 Referral Bonus (%)", description: "Bonus percentage on deposit amount for 3rd-level referrals" },
  { key: "referral_daily_l1_percent", value: "2", label: "Level 1 Daily Earnings Referral (%)", description: "Percentage of referee daily earnings credited to L1 referrer" },
  { key: "referral_daily_l2_percent", value: "1", label: "Level 2 Daily Earnings Referral (%)", description: "Percentage of referee daily earnings credited to L2 referrer" },
  { key: "referral_daily_l3_percent", value: "0.5", label: "Level 3 Daily Earnings Referral (%)", description: "Percentage of referee daily earnings credited to L3 referrer" },
  { key: "vip_silver_min", value: "5000", label: "VIP Silver Minimum Deposit", description: "Total deposits required to reach Silver VIP tier (KSH)" },
  { key: "vip_gold_min", value: "20000", label: "VIP Gold Minimum Deposit", description: "Total deposits required to reach Gold VIP tier (KSH)" },
  { key: "vip_platinum_min", value: "100000", label: "VIP Platinum Minimum Deposit", description: "Total deposits required to reach Platinum VIP tier (KSH)" },
];

export async function initPlatformSettings(): Promise<void> {
  for (const d of DEFAULTS) {
    const [existing] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, d.key));
    if (!existing) {
      await db.insert(platformSettingsTable).values(d);
      logger.info({ key: d.key }, "Seeded missing platform setting");
    }
  }
}
