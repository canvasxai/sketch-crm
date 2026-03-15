import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("gmail_sync_state")
    .addColumn("oldest_email_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("gmail_sync_state")
    .addColumn("newest_email_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("gmail_sync_state")
    .dropColumn("oldest_email_at")
    .execute();

  await db.schema
    .alterTable("gmail_sync_state")
    .dropColumn("newest_email_at")
    .execute();
}
