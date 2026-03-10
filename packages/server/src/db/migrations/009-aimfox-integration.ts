import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── AimFox sync state (mirrors gmail_sync_state pattern) ──
  await db.schema
    .createTable("aimfox_sync_state")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("last_sync_at", "timestamptz")
    .addColumn("last_webhook_at", "timestamptz")
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("idle"),
    )
    .addColumn("error_message", "text")
    .addColumn("leads_synced", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("messages_synced", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("contacts_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("companies_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("last_backfill_cursor", "integer")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`CREATE TRIGGER set_updated_at_aimfox_sync_state BEFORE UPDATE ON aimfox_sync_state FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(
    db,
  );

  // ── Webhook audit log ──
  await db.schema
    .createTable("aimfox_webhook_log")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addColumn("processed", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("error_message", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`CREATE INDEX idx_aimfox_webhook_log_event_type ON aimfox_webhook_log(event_type)`.execute(
    db,
  );

  // ── New columns on contacts for AimFox linking ──
  await db.schema
    .alterTable("contacts")
    .addColumn("aimfox_lead_id", "text")
    .execute();

  await sql`CREATE UNIQUE INDEX idx_contacts_aimfox_lead_id ON contacts(aimfox_lead_id) WHERE aimfox_lead_id IS NOT NULL`.execute(
    db,
  );

  await db.schema
    .alterTable("contacts")
    .addColumn("aimfox_profile_data", "jsonb")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("contacts").dropColumn("aimfox_profile_data").execute();
  await sql`DROP INDEX IF EXISTS idx_contacts_aimfox_lead_id`.execute(db);
  await db.schema.alterTable("contacts").dropColumn("aimfox_lead_id").execute();
  await db.schema.dropTable("aimfox_webhook_log").ifExists().execute();
  await sql`DROP TRIGGER IF EXISTS set_updated_at_aimfox_sync_state ON aimfox_sync_state`.execute(db);
  await db.schema.dropTable("aimfox_sync_state").ifExists().execute();
}
