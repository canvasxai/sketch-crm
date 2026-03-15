import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add is_decision_maker flag
  await sql`ALTER TABLE contacts ADD COLUMN is_decision_maker BOOLEAN NOT NULL DEFAULT false`.execute(db);

  // 2. Migrate "connected" contacts → inherit company pipeline (or 'client' as fallback)
  await sql`
    UPDATE contacts
    SET pipeline = CASE
      WHEN company_id IS NOT NULL AND (
        SELECT c.pipeline FROM companies c WHERE c.id = contacts.company_id
      ) NOT IN ('uncategorized', 'connected', 'muted')
      THEN (SELECT c.pipeline FROM companies c WHERE c.id = contacts.company_id)
      ELSE 'client'
    END
    WHERE pipeline = 'connected'
  `.execute(db);

  // 3. Migrate "connected" companies → 'client'
  await sql`
    UPDATE companies SET pipeline = 'client' WHERE pipeline = 'connected'
  `.execute(db);

  // 4. Partial index for fast decision-maker lookups
  await sql`CREATE INDEX idx_contacts_is_decision_maker ON contacts(is_decision_maker) WHERE is_decision_maker = true`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_contacts_is_decision_maker`.execute(db);
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS is_decision_maker`.execute(db);
}
