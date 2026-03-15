import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Track which contacts have been checked for Tier 3 (fuzzy name) dedup
  await sql`ALTER TABLE contacts ADD COLUMN dedup_checked_at TIMESTAMPTZ`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS dedup_checked_at`.execute(db);
}
