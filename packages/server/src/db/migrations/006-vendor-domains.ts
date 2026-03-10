import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("vendor_domains")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("domain", "text", (col) => col.notNull().unique())
    .addColumn("source", "text", (col) => col.notNull().defaultTo("manual"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE TRIGGER set_updated_at_vendor_domains
    BEFORE UPDATE ON vendor_domains
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  // Migrate existing vendor domains from org_settings
  const row = await sql<{ value: string }>`
    SELECT value FROM org_settings WHERE key = 'vendor_domains'
  `.execute(db);

  if (row.rows.length > 0 && row.rows[0].value) {
    const domains: string[] =
      typeof row.rows[0].value === "string" ? JSON.parse(row.rows[0].value) : (row.rows[0].value as string[]);

    for (const domain of domains) {
      await sql`
        INSERT INTO vendor_domains (domain, source)
        VALUES (${domain.toLowerCase()}, 'manual')
        ON CONFLICT (domain) DO NOTHING
      `.execute(db);
    }
  }

  // Remove the old key from org_settings
  await sql`DELETE FROM org_settings WHERE key = 'vendor_domains'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS set_updated_at_vendor_domains ON vendor_domains`.execute(db);
  await db.schema.dropTable("vendor_domains").ifExists().execute();
}
