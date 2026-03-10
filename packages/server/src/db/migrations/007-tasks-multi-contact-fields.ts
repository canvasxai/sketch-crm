import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create tasks table
  await db.schema
    .createTable("tasks")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) =>
      col.references("contacts.id").onDelete("cascade"),
    )
    .addColumn("company_id", "uuid", (col) =>
      col.references("companies.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("assignee_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("due_date", "timestamptz")
    .addColumn("completed", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE TRIGGER set_updated_at_tasks
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  await db.schema.createIndex("idx_tasks_contact_id").on("tasks").column("contact_id").execute();
  await db.schema.createIndex("idx_tasks_company_id").on("tasks").column("company_id").execute();
  await db.schema.createIndex("idx_tasks_assignee_id").on("tasks").column("assignee_id").execute();
  await db.schema.createIndex("idx_tasks_completed").on("tasks").column("completed").execute();

  // 2. Create stage_changes table
  await db.schema
    .createTable("stage_changes")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) =>
      col.notNull().references("contacts.id").onDelete("cascade"),
    )
    .addColumn("from_stage", "text", (col) => col.notNull())
    .addColumn("to_stage", "text", (col) => col.notNull())
    .addColumn("changed_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_stage_changes_contact_id").on("stage_changes").column("contact_id").execute();
  await db.schema.createIndex("idx_stage_changes_created_at").on("stage_changes").columns(["created_at desc"]).execute();

  // 3. Add lead_channel column to contacts
  await sql`ALTER TABLE contacts ADD COLUMN lead_channel text`.execute(db);

  // 4. Add emails jsonb column to contacts
  await sql`ALTER TABLE contacts ADD COLUMN emails jsonb NOT NULL DEFAULT '[]'`.execute(db);

  // 5. Add phones jsonb column to contacts
  await sql`ALTER TABLE contacts ADD COLUMN phones jsonb NOT NULL DEFAULT '[]'`.execute(db);

  // 6. Migrate existing contacts.email → contacts.emails JSON array
  await sql`
    UPDATE contacts
    SET emails = jsonb_build_array(jsonb_build_object('email', email, 'type', 'work', 'isPrimary', true))
    WHERE email IS NOT NULL AND email != ''
  `.execute(db);

  // 7. Migrate existing contacts.phone → contacts.phones JSON array
  await sql`
    UPDATE contacts
    SET phones = jsonb_build_array(jsonb_build_object('phone', phone, 'type', 'mobile', 'isPrimary', true))
    WHERE phone IS NOT NULL AND phone != ''
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove columns from contacts
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS phones`.execute(db);
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS emails`.execute(db);
  await sql`ALTER TABLE contacts DROP COLUMN IF EXISTS lead_channel`.execute(db);

  // Drop stage_changes table
  await db.schema.dropTable("stage_changes").ifExists().execute();

  // Drop tasks table
  await sql`DROP TRIGGER IF EXISTS set_updated_at_tasks ON tasks`.execute(db);
  await db.schema.dropTable("tasks").ifExists().execute();
}
