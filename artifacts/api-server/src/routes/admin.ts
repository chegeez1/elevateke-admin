import { Router, type IRouter } from "express";
import { db, usersTable, depositsTable, withdrawalsTable, earningsTable, depositPlansTable, tasksTable, announcementsTable, inboxMessagesTable, tradesTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth";
import { CreatePlanBody, CreateTaskBody } from "@workspace/api-zod";
import { tradeSettings, setTradeDirection } from "./trade";
import { sendWithdrawalApprovedEmail, sendWithdrawalRejectedEmail } from "../mailer";

const router: IRouter = Router();
// Only lock down paths that start with /admin — do NOT use a blanket
// router.use(authenticate, requireAdmin) here because the admin router is
// mounted without a path prefix, meaning it intercepts EVERY request and
// would 403 all non-admin users before they even reach other routers.
router.use("/admin", authenticate, requireAdmin);

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone,
    balance: Number(u.balance), totalEarned: Number(u.totalEarned),
    totalDeposited: Number(u.totalDeposited), vipLevel: u.vipLevel,
    referralCode: u.referralCode, isAdmin: u.isAdmin, isSuspended: u.isSuspended,
    createdAt: u.createdAt.toISOString(),
    depositReminderSentAt: u.depositReminderSentAt?.toISOString() ?? null,
  };
}

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [users] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const [pendingWithdrawals] = await db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));
  const [totalDeposited] = await db.select({ total: sql<number>`coalesce(sum(${depositsTable.amount}), 0)` })
    .from(depositsTable).where(eq(depositsTable.status, "active"));
  const [totalWithdrawn] = await db.select({ total: sql<number>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable).where(eq(withdrawalsTable.status, "approved"));
  const [totalEarnings] = await db.select({ total: sql<number>`coalesce(sum(${earningsTable.amount}), 0)` }).from(earningsTable);
  const [activeDeposits] = await db.select({ count: sql<number>`count(*)` }).from(depositsTable).where(eq(depositsTable.status, "active"));
  const [activeTrades] = await db.select({ count: sql<number>`count(*)` }).from(tradesTable).where(eq(tradesTable.status, "active"));

  const depositedNum = Number(totalDeposited?.total ?? 0);
  const withdrawnNum = Number(totalWithdrawn?.total ?? 0);
  res.json({
    totalUsers: Number(users?.count ?? 0),
    pendingWithdrawalsCount: Number(pendingWithdrawals?.count ?? 0),
    pendingWithdrawalsAmount: Number(pendingWithdrawals?.total ?? 0),
    totalDepositedActive: depositedNum,
    totalWithdrawn: withdrawnNum,
    netRevenue: depositedNum - withdrawnNum,
    totalEarningsPaid: Number(totalEarnings?.total ?? 0),
    activeDeposits: Number(activeDeposits?.count ?? 0),
    activeTradesCount: Number(activeTrades?.count ?? 0),
    tradeDirection: tradeSettings.direction,
  });
});

router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(200);
  res.json(users.map(formatUser));
});

router.get("/admin/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const deposits = await db.select({
    d: depositsTable,
    planName: depositPlansTable.name,
  }).from(depositsTable)
    .leftJoin(depositPlansTable, eq(depositsTable.planId, depositPlansTable.id))
    .where(eq(depositsTable.userId, id))
    .orderBy(desc(depositsTable.createdAt));

  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, id));

  res.json({
    user: { ...formatUser(user), referredBy: user.referredBy ?? null },
    deposits: deposits.map(({ d, planName }) => ({
      id: d.id,
      planName: planName ?? "Unknown",
      amount: Number(d.amount),
      dailyEarning: Number(d.dailyEarning),
      status: d.status,
      paystackRef: d.paystackRef ?? null,
      startsAt: d.startsAt?.toISOString() ?? null,
      endsAt: d.endsAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    withdrawals: withdrawals.map(w => ({ id: w.id, amount: Number(w.amount), status: w.status, requestedAt: w.requestedAt.toISOString() })),
  });
});

router.post("/admin/users/:id/suspend", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.update(usersTable).set({ isSuspended: true }).where(eq(usersTable.id, id));
  res.json({ success: true, message: "User suspended" });
});

router.post("/admin/users/:id/unsuspend", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.update(usersTable).set({ isSuspended: false }).where(eq(usersTable.id, id));
  res.json({ success: true, message: "User unsuspended" });
});

router.get("/admin/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(depositPlansTable).orderBy(depositPlansTable.id);
  res.json(plans.map(p => ({
    id: p.id, name: p.name, minAmount: Number(p.minAmount),
    maxAmount: p.maxAmount ? Number(p.maxAmount) : null,
    dailyRate: Number(p.dailyRate), durationDays: p.durationDays,
    bonusPercent: Number(p.bonusPercent), isActive: p.isActive,
    description: p.description ?? null, createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/admin/plans", async (req, res): Promise<void> => {
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [plan] = await db.insert(depositPlansTable).values({
    ...parsed.data,
    minAmount: parsed.data.minAmount.toString(),
    maxAmount: parsed.data.maxAmount?.toString(),
    dailyRate: parsed.data.dailyRate.toString(),
    bonusPercent: (parsed.data.bonusPercent ?? 0).toString(),
  }).returning();
  res.status(201).json({ ...plan, minAmount: Number(plan.minAmount), maxAmount: plan.maxAmount ? Number(plan.maxAmount) : null, dailyRate: Number(plan.dailyRate), bonusPercent: Number(plan.bonusPercent) });
});

router.patch("/admin/plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [plan] = await db.update(depositPlansTable).set({
    ...parsed.data,
    minAmount: parsed.data.minAmount.toString(),
    maxAmount: parsed.data.maxAmount?.toString(),
    dailyRate: parsed.data.dailyRate.toString(),
    bonusPercent: (parsed.data.bonusPercent ?? 0).toString(),
  }).where(eq(depositPlansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ ...plan, minAmount: Number(plan.minAmount), maxAmount: plan.maxAmount ? Number(plan.maxAmount) : null, dailyRate: Number(plan.dailyRate), bonusPercent: Number(plan.bonusPercent) });
});

router.delete("/admin/plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(depositPlansTable).where(eq(depositPlansTable.id, id));
  res.json({ success: true, message: "Plan deleted" });
});

router.get("/admin/tasks", async (_req, res): Promise<void> => {
  const tasks = await db.select().from(tasksTable).orderBy(tasksTable.id);
  res.json(tasks.map(t => ({
    id: t.id, title: t.title, description: t.description,
    reward: Number(t.reward), link: t.link ?? null,
    isActive: t.isActive, createdAt: t.createdAt.toISOString(),
  })));
});

router.post("/admin/tasks", async (req, res): Promise<void> => {
  const { title, description, reward, link, isActive } = req.body as { title: string; description: string; reward: number; link?: string; isActive?: boolean };
  const [task] = await db.insert(tasksTable).values({
    title, description, reward: reward.toString(), link: link ?? null, isActive: isActive ?? true,
  }).returning();
  res.status(201).json({ ...task, reward: Number(task.reward) });
});

router.patch("/admin/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { title, description, reward, link, isActive } = req.body as { title?: string; description?: string; reward?: number; link?: string; isActive?: boolean };
  const updates: Partial<typeof tasksTable.$inferInsert> = {};
  if (title) updates.title = title;
  if (description) updates.description = description;
  if (reward !== undefined) updates.reward = reward.toString();
  if (link !== undefined) updates.link = link;
  if (isActive !== undefined) updates.isActive = isActive;
  const [task] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json({ ...task, reward: Number(task.reward) });
});

router.delete("/admin/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ success: true, message: "Task deleted" });
});

router.get("/admin/deposits", async (_req, res): Promise<void> => {
  const deposits = await db.select({
    d: depositsTable,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userPhone: usersTable.phone,
    planName: depositPlansTable.name,
  }).from(depositsTable)
    .leftJoin(usersTable, eq(depositsTable.userId, usersTable.id))
    .leftJoin(depositPlansTable, eq(depositsTable.planId, depositPlansTable.id))
    .orderBy(desc(depositsTable.createdAt));
  res.json(deposits.map(({ d, userName, userEmail, userPhone, planName }) => ({
    id: d.id, userId: d.userId,
    userName: userName ?? "Unknown", userEmail: userEmail ?? "", userPhone: userPhone ?? "",
    planName: planName ?? "Unknown", amount: Number(d.amount), bonusAmount: Number(d.bonusAmount),
    dailyEarning: Number(d.dailyEarning), status: d.status,
    paystackRef: d.paystackRef ?? null, autoRenew: d.autoRenew,
    startsAt: d.startsAt?.toISOString() ?? null, endsAt: d.endsAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  })));
});

router.patch("/admin/deposits/:id/activate", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deposit] = await db.select().from(depositsTable).where(eq(depositsTable.id, id));
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }
  if (deposit.status !== "pending") { res.status(400).json({ error: "Only pending deposits can be activated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, deposit.userId));
  const [updated] = await db.update(depositsTable).set({
    status: "active", startsAt: new Date(),
  }).where(eq(depositsTable.id, id)).returning();

  const newDeposited = Number(user?.totalDeposited ?? 0) + Number(deposit.amount) + Number(deposit.bonusAmount);
  const newBalance = Number(user?.balance ?? 0) + Number(deposit.bonusAmount);
  const vipRows = await db.select().from(platformSettingsTable);
  const get = (key: string, def: number) => Number(vipRows.find(r => r.key === key)?.value ?? def);
  let vipLevel = "Bronze";
  if (newDeposited >= get("vip_platinum_min", 50000)) vipLevel = "Platinum";
  else if (newDeposited >= get("vip_gold_min", 20000)) vipLevel = "Gold";
  else if (newDeposited >= get("vip_silver_min", 5000)) vipLevel = "Silver";

  await db.update(usersTable).set({
    totalDeposited: newDeposited.toString(), balance: newBalance.toString(), vipLevel,
  }).where(eq(usersTable.id, deposit.userId));

  await db.insert(inboxMessagesTable).values({
    userId: deposit.userId,
    title: "Deposit Activated",
    content: `Your deposit of KSH ${Number(deposit.amount).toLocaleString("en-KE")} has been manually activated by admin. You will earn KSH ${Number(deposit.dailyEarning).toLocaleString("en-KE")} per day.`,
  });

  res.json({ success: true, message: "Deposit activated", deposit: updated });
});

router.patch("/admin/deposits/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deposit] = await db.select().from(depositsTable).where(eq(depositsTable.id, id));
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }
  if (!["pending", "active"].includes(deposit.status)) { res.status(400).json({ error: "Cannot cancel this deposit" }); return; }

  await db.update(depositsTable).set({ status: "cancelled" }).where(eq(depositsTable.id, id));
  await db.insert(inboxMessagesTable).values({
    userId: deposit.userId,
    title: "Deposit Cancelled",
    content: `Your deposit of KSH ${Number(deposit.amount).toLocaleString("en-KE")} has been cancelled by admin. Please contact support if you believe this is an error.`,
  });
  res.json({ success: true, message: "Deposit cancelled" });
});

router.get("/admin/withdrawals", async (_req, res): Promise<void> => {
  const withdrawals = await db.select({
    w: withdrawalsTable,
    userName: usersTable.name,
    userEmail: usersTable.email,
  }).from(withdrawalsTable)
    .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
    .orderBy(desc(withdrawalsTable.requestedAt));
  res.json(withdrawals.map(({ w, userName, userEmail }) => ({
    id: w.id, userId: w.userId, userName: userName ?? "Unknown", userEmail: userEmail ?? "",
    amount: Number(w.amount), mpesaPhone: w.phone, status: w.status,
    adminNote: w.adminNote ?? null, processedAt: w.processedAt?.toISOString() ?? null,
    createdAt: w.requestedAt.toISOString(),
  })));
});

router.patch("/admin/withdrawals/:id/approve", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }

  await db.insert(inboxMessagesTable).values({
    userId: withdrawal.userId,
    title: "Withdrawal Approved",
    content: `Your withdrawal of KSH ${withdrawal.amount} to ${withdrawal.phone} has been approved and will be processed within 2-24 hours.`,
  });

  await db.update(withdrawalsTable).set({ status: "approved", processedAt: new Date() })
    .where(eq(withdrawalsTable.id, id));

  const [approvedUser] = await db.select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, withdrawal.userId));
  if (approvedUser) {
    sendWithdrawalApprovedEmail(approvedUser.email, approvedUser.name, Number(withdrawal.amount))
      .catch(() => {});
  }

  res.json({ success: true, message: "Withdrawal approved" });
});

router.patch("/admin/withdrawals/:id/reject", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { reason } = req.body as { reason?: string };

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }

  if (withdrawal.status === "pending") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, withdrawal.userId));
    const refundBalance = Number(user?.balance ?? 0) + Number(withdrawal.amount);
    await db.update(usersTable).set({ balance: refundBalance.toString() }).where(eq(usersTable.id, withdrawal.userId));
  }

  await db.insert(inboxMessagesTable).values({
    userId: withdrawal.userId,
    title: "Withdrawal Rejected",
    content: `Your withdrawal of KSH ${withdrawal.amount} has been rejected. ${reason ? `Reason: ${reason}` : ""} The amount has been refunded to your balance.`,
  });

  await db.update(withdrawalsTable).set({
    status: "rejected", adminNote: reason ?? null, processedAt: new Date(),
  }).where(eq(withdrawalsTable.id, id));

  const [rejectedUser] = await db.select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, withdrawal.userId));
  if (rejectedUser) {
    sendWithdrawalRejectedEmail(rejectedUser.email, rejectedUser.name, Number(withdrawal.amount), reason)
      .catch(() => {});
  }

  res.json({ success: true, message: "Withdrawal rejected and balance refunded" });
});

router.get("/admin/trade/settings", (_req, res): void => {
  res.json(tradeSettings);
});

router.patch("/admin/trade/settings", async (req, res): Promise<void> => {
  const { direction } = req.body as { direction: string };
  if (!["up", "down"].includes(direction)) {
    res.status(400).json({ error: "Direction must be 'up' or 'down'" }); return;
  }
  await setTradeDirection(direction as "up" | "down");
  res.json(tradeSettings);
});

router.get("/admin/announcements", async (_req, res): Promise<void> => {
  const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  res.json(announcements.map(a => ({
    id: a.id, title: a.title, content: a.content, isActive: a.isActive, createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/admin/announcements", async (req, res): Promise<void> => {
  const { title, content, body } = req.body as { title: string; content?: string; body?: string };
  const text = content || body || "";
  const [a] = await db.insert(announcementsTable).values({ title, content: text, isActive: true }).returning();
  res.status(201).json({ ...a });
});

router.patch("/admin/announcements/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { title, content, body, isActive } = req.body as { title?: string; content?: string; body?: string; isActive?: boolean };
  const updates: Partial<typeof announcementsTable.$inferInsert> = {};
  if (title) updates.title = title;
  if (content || body) updates.content = content || body || "";
  if (isActive !== undefined) updates.isActive = isActive;
  const [a] = await db.update(announcementsTable).set(updates).where(eq(announcementsTable.id, id)).returning();
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.json(a);
});

router.delete("/admin/announcements/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.json({ success: true, message: "Announcement deleted" });
});

router.post("/admin/inbox/send", async (req, res): Promise<void> => {
  const { userId, subject, title, body, content, broadcast } = req.body as { userId?: number; subject?: string; title?: string; body?: string; content?: string; broadcast?: boolean };
  const msgTitle = title || subject || "Message from ElevateKe";
  const msgContent = content || body || "";
  if (broadcast) {
    const allUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isAdmin, false));
    for (const user of allUsers) {
      await db.insert(inboxMessagesTable).values({ userId: user.id, title: msgTitle, content: msgContent });
    }
    res.status(201).json({ success: true, message: `Message sent to ${allUsers.length} users` });
  } else if (userId) {
    await db.insert(inboxMessagesTable).values({ userId, title: msgTitle, content: msgContent });
    res.status(201).json({ success: true, message: "Message sent" });
  } else {
    res.status(400).json({ error: "Provide userId or set broadcast: true" });
  }
});

router.get("/admin/reports/export", async (_req, res): Promise<void> => {
  const [users] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const [deposits] = await db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${depositsTable.amount}), 0)` }).from(depositsTable);
  const [withdrawals] = await db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${withdrawalsTable.amount}), 0)` }).from(withdrawalsTable);
  const [earnings] = await db.select({ total: sql<number>`coalesce(sum(${earningsTable.amount}), 0)` }).from(earningsTable);
  const [pendingW] = await db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${withdrawalsTable.amount}), 0)` }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));

  res.json({
    generatedAt: new Date().toISOString(),
    totalUsers: Number(users?.count ?? 0),
    totalDeposits: Number(deposits?.count ?? 0),
    totalDepositedAmount: Number(deposits?.total ?? 0),
    totalWithdrawals: Number(withdrawals?.count ?? 0),
    totalWithdrawnAmount: Number(withdrawals?.total ?? 0),
    totalEarningsPaid: Number(earnings?.total ?? 0),
    pendingWithdrawalsCount: Number(pendingW?.count ?? 0),
    pendingWithdrawalsAmount: Number(pendingW?.total ?? 0),
    netRevenue: Number(deposits?.total ?? 0) - Number(withdrawals?.total ?? 0),
  });
});

router.get("/admin/reminder-stats", async (_req, res): Promise<void> => {
  const countsResult = await db.execute(sql`
    SELECT
      SUM(CASE WHEN deposit_reminder_sent_at IS NOT NULL  THEN 1 ELSE 0 END)::int AS r1_sent,
      SUM(CASE WHEN deposit_reminder_sent_at IS NOT NULL  AND EXISTS (
        SELECT 1 FROM deposits d WHERE d.user_id = users.id
          AND d.status IN ('active','completed') AND d.created_at >= users.deposit_reminder_sent_at
      ) THEN 1 ELSE 0 END)::int AS r1_converted,
      SUM(CASE WHEN deposit_reminder2_sent_at IS NOT NULL THEN 1 ELSE 0 END)::int AS r2_sent,
      SUM(CASE WHEN deposit_reminder2_sent_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM deposits d WHERE d.user_id = users.id
          AND d.status IN ('active','completed') AND d.created_at >= users.deposit_reminder2_sent_at
      ) THEN 1 ELSE 0 END)::int AS r2_converted,
      SUM(CASE WHEN deposit_reminder3_sent_at IS NOT NULL THEN 1 ELSE 0 END)::int AS r3_sent,
      SUM(CASE WHEN deposit_reminder3_sent_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM deposits d WHERE d.user_id = users.id
          AND d.status IN ('active','completed') AND d.created_at >= users.deposit_reminder3_sent_at
      ) THEN 1 ELSE 0 END)::int AS r3_converted
    FROM users
    WHERE is_admin = false
  `);
  const counts = countsResult.rows[0];

  const medianQuery = (reminderCol: string) => sql.raw(`
    SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
      EXTRACT(EPOCH FROM (fd.first_deposit_at - u.${reminderCol})) / 3600
    )::numeric, 1) AS median_hours
    FROM users u
    INNER JOIN (
      SELECT user_id, MIN(created_at) AS first_deposit_at
      FROM deposits WHERE status IN ('active', 'completed') GROUP BY user_id
    ) fd ON fd.user_id = u.id
    WHERE u.${reminderCol} IS NOT NULL
      AND fd.first_deposit_at >= u.${reminderCol}
      AND u.is_admin = false
  `);

  const [m1Result, m2Result, m3Result] = await Promise.all([
    db.execute(medianQuery("deposit_reminder_sent_at")),
    db.execute(medianQuery("deposit_reminder2_sent_at")),
    db.execute(medianQuery("deposit_reminder3_sent_at")),
  ]);
  const m1 = m1Result.rows[0];
  const m2 = m2Result.rows[0];
  const m3 = m3Result.rows[0];

  const r1Sent = Number(counts?.r1_sent ?? 0);
  const r1Conv = Number(counts?.r1_converted ?? 0);
  const r2Sent = Number(counts?.r2_sent ?? 0);
  const r2Conv = Number(counts?.r2_converted ?? 0);
  const r3Sent = Number(counts?.r3_sent ?? 0);
  const r3Conv = Number(counts?.r3_converted ?? 0);

  res.json({
    reminder1: {
      sent: r1Sent,
      converted: r1Conv,
      conversionRate: r1Sent > 0 ? Math.round((r1Conv / r1Sent) * 100) : 0,
      medianHoursToDeposit: m1?.median_hours != null ? Number(m1.median_hours) : null,
    },
    reminder2: {
      sent: r2Sent,
      converted: r2Conv,
      conversionRate: r2Sent > 0 ? Math.round((r2Conv / r2Sent) * 100) : 0,
      medianHoursToDeposit: m2?.median_hours != null ? Number(m2.median_hours) : null,
    },
    reminder3: {
      sent: r3Sent,
      converted: r3Conv,
      conversionRate: r3Sent > 0 ? Math.round((r3Conv / r3Sent) * 100) : 0,
      medianHoursToDeposit: m3?.median_hours != null ? Number(m3.median_hours) : null,
    },
  });
});

router.post("/admin/users/:id/adjust-balance", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, note } = req.body as { amount: number; note?: string };
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const newBalance = Math.max(0, Number(user.balance) + amount);
  await db.update(usersTable).set({ balance: newBalance.toString() }).where(eq(usersTable.id, id));
  await db.insert(inboxMessagesTable).values({
    userId: id,
    title: "Balance Adjustment",
    content: `Your balance has been adjusted by KSH ${amount >= 0 ? '+' : ''}${amount}. ${note ?? ""}`,
  });
  res.json({ success: true, newBalance, message: "Balance adjusted" });
});

// ── Platform Settings ──────────────────────────────────────────────────
router.get("/admin/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.key);
  const map: Record<string, { value: string; label: string; description: string | null }> = {};
  for (const r of rows) {
    map[r.key] = { value: r.value, label: r.label, description: r.description ?? null };
  }
  res.json(map);
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Body must be an object of { key: value }" }); return;
  }
  for (const [key, value] of Object.entries(updates)) {
    const num = Number(value);
    if (typeof value !== "string" || isNaN(num) || num < 0) {
      res.status(400).json({ error: `Invalid value for ${key}: must be a non-negative number` }); return;
    }
    if (key.endsWith("_percent") && num > 100) {
      res.status(400).json({ error: `Invalid value for ${key}: percentage cannot exceed 100` }); return;
    }
    await db.update(platformSettingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(platformSettingsTable.key, key));
  }
  // Cross-validate min/max withdrawal after all updates
  const allRows = await db.select().from(platformSettingsTable);
  const getVal = (k: string) => Number(allRows.find(r => r.key === k)?.value ?? 0);
  if (getVal("min_withdrawal_amount") > getVal("max_withdrawal_amount")) {
    // Revert if invalid — just return error (frontend should prevent this)
    res.status(400).json({ error: "Minimum withdrawal cannot exceed maximum withdrawal" }); return;
  }
  res.json({ success: true, message: "Settings updated" });
});

// Public endpoint so invest-platform can read min amounts etc.
router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json(map);
});

export default router;
