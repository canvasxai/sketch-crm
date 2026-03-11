/**
 * Migration 013: Classification logs, runs, and needs_classification flag.
 *
 * - Add needs_classification boolean to contacts
 * - Create classification_runs table (tracks async classification jobs)
 * - Create classification_logs table (per-contact classification audit trail)
 * - Backfill: flag unclassified contacts
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // ── 1. Add needs_classification flag to contacts ──

  await db.schema
    .alterTable("contacts")
    .addColumn("needs_classification", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

  await sql`CREATE INDEX idx_contacts_needs_classification ON contacts(needs_classification) WHERE needs_classification = true`.execute(
    db,
  );

  // ── 2. Create classification_runs table ──

  await db.schema
    .createTable("classification_runs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("running"),
    )
    .addColumn("total_contacts", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("processed_contacts", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("pipeline_changes", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("errors", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("started_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  // ── 3. Create classification_logs table ──

  await db.schema
    .createTable("classification_logs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("contact_id", "uuid", (col) =>
      col.notNull().references("contacts.id").onDelete("cascade"),
    )
    .addColumn("run_id", "uuid", (col) =>
      col.notNull().references("classification_runs.id").onDelete("cascade"),
    )
    .addColumn("pipeline_assigned", "text")
    .addColumn("previous_pipeline", "text")
    .addColumn("ai_summary", "text")
    .addColumn("confidence", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`CREATE INDEX idx_classification_logs_contact ON classification_logs(contact_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_classification_logs_run ON classification_logs(run_id)`.execute(
    db,
  );

  // ── 4. Backfill: flag unclassified contacts ──

  await sql`UPDATE contacts SET needs_classification = true WHERE ai_classified_at IS NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("classification_logs").ifExists().execute();
  await db.schema.dropTable("classification_runs").ifExists().execute();

  await db.schema
    .alterTable("contacts")
    .dropColumn("needs_classification")
    .execute();
}
