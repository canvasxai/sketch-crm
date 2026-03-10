import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add OAuth token columns to users table
  await db.schema
    .alterTable("users")
    .addColumn("google_access_token", "text")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("google_refresh_token", "text")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("google_token_expiry", "timestamptz")
    .execute();

  // Gmail sync state table
  await db.schema
    .createTable("gmail_sync_state")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("last_sync_at", "timestamptz")
    .addColumn("sync_history_id", "text")
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("idle"),
    )
    .addColumn("error_message", "text")
    .addColumn("emails_synced", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("contacts_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("companies_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`CREATE TRIGGER set_updated_at_gmail_sync_state BEFORE UPDATE ON gmail_sync_state FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_gmail_sync_state_user ON gmail_sync_state(user_id)`.execute(
    db,
  );

  // Add gmail_message_id to emails for deduplication
  await db.schema
    .alterTable("emails")
    .addColumn("gmail_message_id", "text")
    .execute();

  await sql`CREATE UNIQUE INDEX idx_emails_gmail_message_id ON emails(gmail_message_id) WHERE gmail_message_id IS NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_emails_gmail_message_id`.execute(db);
  await db.schema.alterTable("emails").dropColumn("gmail_message_id").execute();
  await db.schema.dropTable("gmail_sync_state").ifExists().execute();
  await db.schema
    .alterTable("users")
    .dropColumn("google_token_expiry")
    .execute();
  await db.schema
    .alterTable("users")
    .dropColumn("google_refresh_token")
    .execute();
  await db.schema
    .alterTable("users")
    .dropColumn("google_access_token")
    .execute();
}
