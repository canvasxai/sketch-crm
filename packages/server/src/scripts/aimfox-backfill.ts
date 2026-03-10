/**
 * Standalone AimFox backfill script.
 * Imports all AimFox leads into the CRM with progress logging.
 *
 * Usage:
 *   npx tsx src/scripts/aimfox-backfill.ts [--max=N] [--batch=N] [--conversations]
 *
 * Options:
 *   --max=N            Max leads to import (default: all)
 *   --batch=N          Batch size per API page (default: 20)
 *   --conversations    Also sync conversations for each lead
 *   --reset            Reset backfill cursor to start from beginning
 */
import { loadConfig } from "../config.js";
import { createDatabase } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { createAimfoxSyncStateRepository } from "../db/repositories/aimfox-sync-state.js";
import { createAimfoxWebhookLogRepository } from "../db/repositories/aimfox-webhook-log.js";
import { createCompaniesRepository } from "../db/repositories/companies.js";
import { createContactsRepository } from "../db/repositories/contacts.js";
import { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import { backfillAimfoxLeads } from "../lib/aimfox-sync.js";

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const maxLeads = getArg("max") ? Number(getArg("max")) : undefined;
const batchSize = getArg("batch") ? Number(getArg("batch")) : 20;
const syncConversations = hasFlag("conversations");
const resetCursor = hasFlag("reset");

console.log("=== AimFox Backfill ===");
console.log(`  Max leads: ${maxLeads ?? "all"}`);
console.log(`  Batch size: ${batchSize}`);
console.log(`  Sync conversations: ${syncConversations}`);
console.log();

const config = loadConfig();
const db = createDatabase(config);
await runMigrations(db);

const deps = {
  contacts: createContactsRepository(db),
  companies: createCompaniesRepository(db),
  linkedinMessages: createLinkedinMessagesRepository(db),
  aimfoxSyncState: createAimfoxSyncStateRepository(db),
  aimfoxWebhookLog: createAimfoxWebhookLogRepository(db),
  config,
};

if (resetCursor) {
  console.log("Resetting backfill cursor...");
  await deps.aimfoxSyncState.upsert({ lastBackfillCursor: 0 });
}

const startTime = Date.now();

try {
  const result = await backfillAimfoxLeads(deps, {
    batchSize,
    syncConversations,
    maxLeads,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log("=== Backfill Complete ===");
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Contacts created: ${result.contactsCreated}`);
  console.log(`  Companies created: ${result.companiesCreated}`);
  console.log(`  Time: ${elapsed}s`);
} catch (err) {
  console.error("Backfill failed:", err);
  process.exit(1);
} finally {
  await db.destroy();
}
