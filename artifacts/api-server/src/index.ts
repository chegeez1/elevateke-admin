import app from "./app";
import { logger } from "./lib/logger";
import { initTradeSettings } from "./routes/trade";
import { expireStalePendingDeposits } from "./routes/deposits";
import { sendDepositReminders } from "./jobs/depositReminder";
import { initPlatformSettings } from "./lib/initPlatformSettings";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initTradeSettings().catch((e) => logger.warn({ err: e }, "Failed to load trade settings from DB"));
initPlatformSettings().catch((e) => logger.warn({ err: e }, "Failed to seed platform settings"));

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const runDepositCleanup = () => {
  expireStalePendingDeposits().catch((e) =>
    logger.warn({ err: e }, "Deposit cleanup job failed"),
  );
};
runDepositCleanup(); // run once on startup to clear any pre-existing stale rows
setInterval(runDepositCleanup, CLEANUP_INTERVAL_MS);

const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // every 1 hour
const runDepositReminders = () => {
  sendDepositReminders().catch((e) =>
    logger.warn({ err: e }, "Deposit reminder job failed"),
  );
};
runDepositReminders(); // run once on startup to catch any users already past 24h
setInterval(runDepositReminders, REMINDER_INTERVAL_MS);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
