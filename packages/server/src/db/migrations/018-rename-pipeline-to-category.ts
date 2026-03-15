import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Rename columns
  await sql`ALTER TABLE companies RENAME COLUMN pipeline TO category`.execute(db);
  await sql`ALTER TABLE contacts RENAME COLUMN pipeline TO category`.execute(db);
  await sql`ALTER TABLE classification_runs RENAME COLUMN pipeline_changes TO category_changes`.execute(db);
  await sql`ALTER TABLE classification_logs RENAME COLUMN pipeline_assigned TO category_assigned`.execute(db);
  await sql`ALTER TABLE classification_logs RENAME COLUMN previous_pipeline TO previous_category`.execute(db);

  // 2. Backfill null contact categories from their company
  await sql`
    UPDATE contacts c
    SET category = co.category
    FROM companies co
    WHERE c.company_id = co.id
      AND c.category IS NULL
  `.execute(db);

  // Contacts without a company get 'uncategorized'
  await sql`
    UPDATE contacts
    SET category = 'uncategorized'
    WHERE category IS NULL
  `.execute(db);

  // 3. Make contacts.category NOT NULL with a default
  await sql`ALTER TABLE contacts ALTER COLUMN category SET NOT NULL`.execute(db);
  await sql`ALTER TABLE contacts ALTER COLUMN category SET DEFAULT 'uncategorized'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse the NOT NULL constraint
  await sql`ALTER TABLE contacts ALTER COLUMN category DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE contacts ALTER COLUMN category DROP DEFAULT`.execute(db);

  // Rename columns back
  await sql`ALTER TABLE classification_logs RENAME COLUMN previous_category TO previous_pipeline`.execute(db);
  await sql`ALTER TABLE classification_logs RENAME COLUMN category_assigned TO pipeline_assigned`.execute(db);
  await sql`ALTER TABLE classification_runs RENAME COLUMN category_changes TO pipeline_changes`.execute(db);
  await sql`ALTER TABLE contacts RENAME COLUMN category TO pipeline`.execute(db);
  await sql`ALTER TABLE companies RENAME COLUMN category TO pipeline`.execute(db);
}
