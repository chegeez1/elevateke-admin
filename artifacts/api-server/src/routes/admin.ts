import { Router, type IRouter } from "express";
import { db, usersTable, depositsTable, withdrawalsTable, earningsTable, depositPlansTable, tasksTable, announcementsTable, inboxMessagesTable, tradesTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middlewares/auth";
import { CreatePlanBody, CreateTaskBody } from "@workspace/api-zod";
import { tradeSettings, setTradeDirection } from "./trade";

const router: IRouter = Router();
router.use(authenticate, requireAdmin);

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone,
    balance: Number(u.balance), totalEarned: Number(u.totalEarned),
    totalDeposited: Number(u.totalDeposited), vipLevel: u.vipLevel,
    referralCode: u.referralCode, isAdmin: u.isAdmin, isSuspended: u.isSuspended,
    createdAt: u.createdAt.toISOString(),
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

  const deposits = await db.select().from(depositsTable).where(eq(depositsTable.userId, id));
  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, id));

  res.json({
    user: { ...formatUser(user), referredBy: user.referredBy ?? null },
    deposits: deposits.map(d => ({ id: d.id, amount: Number(d.amount), status: d.status, createdAt: d.createdAt.toISOString() })),
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

router.get("/admin/withdrawals", async (_req, res): Promise<void> => {
  const withdrawals = await db.select({
    w: withdrawalsTable,
    userName: usersTable.name,
    userEmail: usersTable.email,
  }).from(withdrawalsTable)
    .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
    .orderBy(desc(withdrawalsTable.createdAt));
  res.json(withdrawals.map(({ w, userName, userEmail }) => ({
    id: w.id, userId: w.userId, userName: userName ?? "Unknown", userEmail: userEmail ?? "",
    amount: Number(w.amount), mpesaPhone: w.mpesaPhone, status: w.status,
    adminNote: w.adminNote ?? null, processedAt: w.processedAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
  })));
});

router.patch("/admin/withdrawals/:id/approve", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }

  await db.insert(inboxMessagesTable).values({
    userId: withdrawal.userId,
    title: "Withdrawal Approved",
    content: `Your withdrawal of KSH ${withdrawal.amount} to ${withdrawal.mpesaPhone} has been approved and will be processed within 2-24 hours.`,
  });

  await db.update(withdrawalsTable).set({ status: "approved", processedAt: new Date() })
    .where(eq(withdrawalsTable.id, id));

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

export default router;
