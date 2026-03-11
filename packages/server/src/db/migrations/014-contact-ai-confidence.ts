import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add ai_confidence column to contacts
  await sql`ALTER TABLE contacts ADD COLUMN ai_confidence TEXT`.execute(db);

  // Backfill from the latest classification_logs entry per contact
  await sql`
    UPDATE contacts c
    SET ai_confidence = sub.confidence
    FROM (
      SELECT DISTINCT ON (contact_id) contact_id, confidence
      FROM classification_logs
      ORDER BY contact_id, created_at DESC
    ) sub
    WHERE c.id = sub.contact_id
      AND sub.confidence IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS ai_confidence`.execute(db);
}
