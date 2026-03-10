import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create dedup_log table for AI-driven contact merge audit trail
  await db.schema
    .createTable("dedup_log")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) =>
      col.notNull().references("contacts.id").onDelete("cascade"),
    )
    .addColumn("merged_email", "text", (col) => col.notNull())
    .addColumn("merged_name", "text")
    .addColumn("match_reason", "text", (col) => col.notNull())
    .addColumn("ai_confidence", "text")
    .addColumn("reviewed", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_dedup_log_contact_id").ifNotExists().on("dedup_log").column("contact_id").execute();
  await db.schema.createIndex("idx_dedup_log_reviewed").ifNotExists().on("dedup_log").column("reviewed").execute();

  // 2. Enable pg_trgm extension for fuzzy name matching
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // 3. Add trigram index on contacts.name for similarity queries
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops)`.execute(db);

  // 4. Add GIN index on contacts.emails JSONB for containment queries
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_emails_gin ON contacts USING gin (emails jsonb_path_ops)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_contacts_emails_gin`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_contacts_name_trgm`.execute(db);
  await sql`DROP EXTENSION IF EXISTS pg_trgm`.execute(db);
  await db.schema.dropTable("dedup_log").ifExists().execute();
}
