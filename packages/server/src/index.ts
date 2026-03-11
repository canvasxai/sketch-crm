/**
 * CRM Server entry point.
 * Bootstrap sequence: config → logger → database → migrations → HTTP server.
 */
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./http.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config);

logger.info("Starting CRM server...");

const db = createDatabase(config);
await runMigrations(db);
logger.info("Database ready");

// Reset any sync states stuck at "syncing" from a previous interrupted run
try {
  const { sql } = await import("kysely");
  await sql`UPDATE aimfox_sync_state SET status = 'idle', error_message = 'Sync interrupted — server restarted' WHERE status = 'syncing'`.execute(db);
  await sql`UPDATE gmail_sync_state SET status = 'idle', error_message = 'Sync interrupted — server restarted' WHERE status = 'syncing'`.execute(db);
  await sql`UPDATE calendar_sync_state SET status = 'idle', error_message = 'Sync interrupted — server restarted' WHERE status = 'syncing'`.execute(db);
  logger.info("Cleared any stuck sync states");
} catch {
  // Tables may not exist yet on first run — safe to ignore
}

const app = createApp(db, config);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(`Server listening on http://localhost:${info.port}`);
});
