import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import plansRouter from "./plans";
import depositsRouter from "./deposits";
import earningsRouter from "./earnings";
import tasksRouter from "./tasks";
import withdrawalsRouter from "./withdrawals";
import tradeRouter from "./trade";
import announcementsRouter from "./announcements";
import inboxRouter from "./inbox";
import adminRouter from "./admin";
import activityRouter from "./activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(plansRouter);
router.use(depositsRouter);
router.use(earningsRouter);
router.use(tasksRouter);
router.use(withdrawalsRouter);
router.use(tradeRouter);
router.use(announcementsRouter);
router.use(inboxRouter);
router.use(adminRouter);
router.use(activityRouter);

export default router;
