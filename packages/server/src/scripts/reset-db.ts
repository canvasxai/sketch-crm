/**
 * Resets all data in the CRM database while preserving schema.
 * Truncates all tables except pipelines, pipeline_stages, and org_settings.
 *
 * Usage:
 *   npx tsx src/scripts/reset-db.ts [--keep-users] [--keep-config]
 *
 * Options:
 *   --keep-users    Preserve users table
 *   --keep-config   Preserve org_settings, pipelines, and pipeline_stages
 *   (by default, users are truncated but config tables are preserved)
 */
import { sql } from "kysely";
import { loadConfig } from "../config.js";
import { createDatabase } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";

const args = process.argv.slice(2);
const hasFlag = (name: string) => args.includes(`--${name}`);
const keepUsers = hasFlag("keep-users");
const keepConfig = hasFlag("keep-config");

const config = loadConfig();
const db = createDatabase(config);
await runMigrations(db);

console.log("=== CRM Database Reset ===");
console.log(`  Keep users: ${keepUsers}`);
console.log(`  Keep config (pipelines/org_settings): ${keepConfig}`);
console.log();

// Data tables — order matters for CASCADE, but TRUNCATE ... CASCADE handles it
const DATA_TABLES = [
  "contacts",
  "companies",
  "emails",
  "linkedin_messages",
  "meetings",
  "notes",
  "tasks",
  "opportunities",
  "opportunity_stage_changes",
  "dedup_log",
  "dedup_candidates",
  "classification_runs",
  "classification_logs",
  "gmail_sync_state",
  "calendar_sync_state",
  "aimfox_sync_state",
  "aimfox_webhook_log",
  "contact_owners",
  "company_owners",
  "muted_domains",
  "fireflies_sync_state",
  "meeting_contacts",
  "action_generation_runs",
];

const CONFIG_TABLES = [
  "pipelines",
  "pipeline_stages",
  "org_settings",
];

try {
  // Always truncate data tables
  const tablesToTruncate = [...DATA_TABLES];

  if (!keepUsers) {
    tablesToTruncate.push("users");
  }

  if (!keepConfig) {
    tablesToTruncate.push(...CONFIG_TABLES);
  }

  // Filter to only tables that exist (handles partial migrations)
  const existingTables = await sql<{ tablename: string }>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`.execute(db);
  const existingSet = new Set(existingTables.rows.map((r) => r.tablename));
  const validTables = tablesToTruncate.filter((t) => existingSet.has(t));

  const tableList = validTables.join(", ");
  await sql.raw(`TRUNCATE ${tableList} CASCADE`).execute(db);

  console.log(`Truncated ${tablesToTruncate.length} tables:`);
  for (const t of tablesToTruncate) {
    console.log(`  ✓ ${t}`);
  }

  console.log();
  console.log("=== Reset Complete ===");
} catch (err) {
  console.error("Reset failed:", err);
  process.exit(1);
} finally {
  await db.destroy();
}
