import { type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("fireflies_sync_state")
    .addColumn("sync_frequency", "text", (col) =>
      col.notNull().defaultTo("manual"),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("fireflies_sync_state")
    .dropColumn("sync_frequency")
    .execute();
}
