import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Track which contacts have already been checked for LinkedIn profile enrichment
  await sql`ALTER TABLE contacts ADD COLUMN linkedin_enriched_at TIMESTAMPTZ`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS linkedin_enriched_at`.execute(db);
}
