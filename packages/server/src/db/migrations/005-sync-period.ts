import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add sync_period column to gmail_sync_state (how far back to pull data)
  await db.schema
    .alterTable("gmail_sync_state")
    .addColumn("sync_period", "text", (col) =>
      col.notNull().defaultTo("3months"),
    )
    .execute();

  // Create calendar_sync_state table (mirrors gmail_sync_state)
  await db.schema
    .createTable("calendar_sync_state")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("last_sync_at", "timestamptz")
    .addColumn("sync_token", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("error_message", "text")
    .addColumn("events_synced", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("contacts_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("meetings_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("sync_frequency", "text", (col) =>
      col.notNull().defaultTo("manual"),
    )
    .addColumn("sync_period", "text", (col) =>
      col.notNull().defaultTo("3months"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // One sync state per user
  await sql`CREATE UNIQUE INDEX idx_calendar_sync_state_user ON calendar_sync_state(user_id)`.execute(
    db,
  );

  // Auto-update updated_at
  await sql`
    CREATE TRIGGER set_updated_at_calendar_sync_state
    BEFORE UPDATE ON calendar_sync_state
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS set_updated_at_calendar_sync_state ON calendar_sync_state`.execute(
    db,
  );
  await db.schema.dropTable("calendar_sync_state").ifExists().execute();
  await db.schema
    .alterTable("gmail_sync_state")
    .dropColumn("sync_period")
    .execute();
}
