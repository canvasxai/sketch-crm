import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create org_settings table for organization-wide config (e.g. internal domains)
  await db.schema
    .createTable("org_settings")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "jsonb", (col) => col.notNull())
    .execute();

  // Seed the internal_domains key
  await sql`INSERT INTO org_settings (key, value) VALUES ('internal_domains', '[]'::jsonb)`.execute(
    db,
  );

  // Add visibility column to contacts
  await db.schema
    .alterTable("contacts")
    .addColumn("visibility", "text", (col) =>
      col.notNull().defaultTo("shared"),
    )
    .execute();

  // Add created_by_user_id column to contacts
  await db.schema
    .alterTable("contacts")
    .addColumn("created_by_user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .execute();

  // Indexes
  await sql`CREATE INDEX idx_contacts_visibility ON contacts(visibility)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_contacts_created_by_user_id ON contacts(created_by_user_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_contacts_created_by_user_id`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_contacts_visibility`.execute(db);
  await db.schema
    .alterTable("contacts")
    .dropColumn("created_by_user_id")
    .execute();
  await db.schema
    .alterTable("contacts")
    .dropColumn("visibility")
    .execute();
  await db.schema.dropTable("org_settings").ifExists().execute();
}
