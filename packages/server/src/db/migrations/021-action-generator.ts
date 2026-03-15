import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Extend tasks table with origin tracking
  await db.schema
    .alterTable("tasks")
    .addColumn("origin", "text", (col) => col.notNull().defaultTo("manual"))
    .execute();

  await db.schema
    .alterTable("tasks")
    .addColumn("source_type", "text")
    .execute();

  await db.schema
    .alterTable("tasks")
    .addColumn("source_id", "text")
    .execute();

  await db.schema
    .alterTable("tasks")
    .addColumn("generation_run_id", "uuid")
    .execute();

  // Create action_generation_runs table (mirrors classification_runs)
  await db.schema
    .createTable("action_generation_runs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("running"))
    .addColumn("total_contacts", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("processed_contacts", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("tasks_created", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("errors", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("started_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  // Add action_processed_at to activity tables
  await db.schema
    .alterTable("emails")
    .addColumn("action_processed_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("linkedin_messages")
    .addColumn("action_processed_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("meetings")
    .addColumn("action_processed_at", "timestamptz")
    .execute();

  // Partial indexes for unprocessed activities
  await sql`CREATE INDEX emails_action_unprocessed ON emails (contact_id) WHERE action_processed_at IS NULL`.execute(
    db,
  );
  await sql`CREATE INDEX linkedin_messages_action_unprocessed ON linkedin_messages (contact_id) WHERE action_processed_at IS NULL`.execute(
    db,
  );
  await sql`CREATE INDEX meetings_action_unprocessed ON meetings (contact_id) WHERE action_processed_at IS NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS meetings_action_unprocessed`.execute(db);
  await sql`DROP INDEX IF EXISTS linkedin_messages_action_unprocessed`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS emails_action_unprocessed`.execute(db);

  await db.schema
    .alterTable("meetings")
    .dropColumn("action_processed_at")
    .execute();
  await db.schema
    .alterTable("linkedin_messages")
    .dropColumn("action_processed_at")
    .execute();
  await db.schema
    .alterTable("emails")
    .dropColumn("action_processed_at")
    .execute();

  await db.schema.dropTable("action_generation_runs").execute();

  await db.schema
    .alterTable("tasks")
    .dropColumn("generation_run_id")
    .execute();
  await db.schema.alterTable("tasks").dropColumn("source_id").execute();
  await db.schema.alterTable("tasks").dropColumn("source_type").execute();
  await db.schema.alterTable("tasks").dropColumn("origin").execute();
}
