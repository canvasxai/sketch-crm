/**
 * Migration 012: Contact deduplication & AI classification.
 *
 * - Add ai_summary and ai_classified_at to contacts
 * - Create dedup_candidates table for Tier 3 fuzzy match review
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // ── 1. Add AI classification fields to contacts ──

  await db.schema
    .alterTable("contacts")
    .addColumn("ai_summary", "text")
    .execute();

  await db.schema
    .alterTable("contacts")
    .addColumn("ai_classified_at", "timestamptz")
    .execute();

  // ── 2. Create dedup_candidates table ──

  await db.schema
    .createTable("dedup_candidates")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id_a", "uuid", (col) =>
      col.notNull().references("contacts.id").onDelete("cascade"),
    )
    .addColumn("contact_id_b", "uuid", (col) =>
      col.notNull().references("contacts.id").onDelete("cascade"),
    )
    .addColumn("match_reason", "text", (col) => col.notNull())
    .addColumn("ai_confidence", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("resolved_at", "timestamptz")
    .execute();

  // Indexes
  await sql`CREATE INDEX idx_dedup_candidates_status ON dedup_candidates(status)`.execute(db);
  await sql`CREATE INDEX idx_dedup_candidates_contact_a ON dedup_candidates(contact_id_a)`.execute(db);
  await sql`CREATE INDEX idx_dedup_candidates_contact_b ON dedup_candidates(contact_id_b)`.execute(db);

  // Prevent duplicate pairs (in either direction)
  await sql`CREATE UNIQUE INDEX idx_dedup_candidates_pair
    ON dedup_candidates(LEAST(contact_id_a, contact_id_b), GREATEST(contact_id_a, contact_id_b))`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("dedup_candidates").ifExists().execute();

  await db.schema.alterTable("contacts").dropColumn("ai_classified_at").execute();
  await db.schema.alterTable("contacts").dropColumn("ai_summary").execute();
}
