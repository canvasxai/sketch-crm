import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add sync_frequency column to gmail_sync_state
  await db.schema
    .alterTable("gmail_sync_state")
    .addColumn("sync_frequency", "text", (col) =>
      col.notNull().defaultTo("manual"),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("gmail_sync_state")
    .dropColumn("sync_frequency")
    .execute();
}
