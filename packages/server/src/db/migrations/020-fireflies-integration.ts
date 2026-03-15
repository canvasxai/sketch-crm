import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create fireflies_sync_state table (singleton, mirrors aimfox_sync_state)
  await db.schema
    .createTable("fireflies_sync_state")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("last_sync_at", "timestamptz")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("error_message", "text")
    .addColumn("transcripts_synced", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("meetings_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("contacts_matched", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("sync_period", "text", (col) =>
      col.notNull().defaultTo("3months"),
    )
    .addColumn("oldest_transcript_at", "timestamptz")
    .addColumn("newest_transcript_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Extend meetings table with Fireflies-specific columns
  await db.schema
    .alterTable("meetings")
    .addColumn("fireflies_transcript_id", "text")
    .execute();

  await db.schema
    .alterTable("meetings")
    .addColumn("ai_summary", "text")
    .execute();

  await db.schema
    .alterTable("meetings")
    .addColumn("action_items", "jsonb")
    .execute();

  await db.schema
    .alterTable("meetings")
    .addColumn("keywords", "jsonb")
    .execute();

  await db.schema
    .alterTable("meetings")
    .addColumn("duration_minutes", "integer")
    .execute();

  // Unique partial index — one meeting per Fireflies transcript
  await sql`CREATE UNIQUE INDEX meetings_fireflies_transcript_id_unique ON meetings (fireflies_transcript_id) WHERE fireflies_transcript_id IS NOT NULL`.execute(
    db,
  );

  // Join table: many-to-many between meetings and contacts
  await db.schema
    .createTable("meeting_contacts")
    .addColumn("meeting_id", "uuid", (col) =>
      col.notNull().references("meetings.id").onDelete("cascade"),
    )
    .addColumn("contact_id", "uuid", (col) =>
      col.notNull().references("contacts.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`ALTER TABLE meeting_contacts ADD PRIMARY KEY (meeting_id, contact_id)`.execute(
    db,
  );

  // Index for querying meetings by contact
  await sql`CREATE INDEX meeting_contacts_contact_id ON meeting_contacts (contact_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS meeting_contacts_contact_id`.execute(db);
  await db.schema.dropTable("meeting_contacts").execute();
  await sql`DROP INDEX IF EXISTS meetings_fireflies_transcript_id_unique`.execute(
    db,
  );
  await db.schema
    .alterTable("meetings")
    .dropColumn("duration_minutes")
    .execute();
  await db.schema.alterTable("meetings").dropColumn("keywords").execute();
  await db.schema.alterTable("meetings").dropColumn("action_items").execute();
  await db.schema.alterTable("meetings").dropColumn("ai_summary").execute();
  await db.schema
    .alterTable("meetings")
    .dropColumn("fireflies_transcript_id")
    .execute();
  await db.schema.dropTable("fireflies_sync_state").execute();
}
