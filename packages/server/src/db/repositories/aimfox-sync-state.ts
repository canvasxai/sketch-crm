import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createAimfoxSyncStateRepository(db: Kysely<DB>) {
  return {
    async get() {
      return db
        .selectFrom("aimfox_sync_state")
        .selectAll()
        .executeTakeFirst();
    },

    async upsert(
      data: Partial<{
        status: string;
        lastSyncAt: string;
        lastWebhookAt: string;
        errorMessage: string | null;
        leadsSynced: number;
        messagesSynced: number;
        contactsCreated: number;
        companiesCreated: number;
        lastBackfillCursor: number | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.status !== undefined) values.status = data.status;
      if (data.lastSyncAt !== undefined) values.last_sync_at = data.lastSyncAt;
      if (data.lastWebhookAt !== undefined) values.last_webhook_at = data.lastWebhookAt;
      if (data.errorMessage !== undefined) values.error_message = data.errorMessage;
      if (data.leadsSynced !== undefined) values.leads_synced = data.leadsSynced;
      if (data.messagesSynced !== undefined) values.messages_synced = data.messagesSynced;
      if (data.contactsCreated !== undefined) values.contacts_created = data.contactsCreated;
      if (data.companiesCreated !== undefined) values.companies_created = data.companiesCreated;
      if (data.lastBackfillCursor !== undefined) values.last_backfill_cursor = data.lastBackfillCursor;

      const existing = await this.get();

      if (existing) {
        if (Object.keys(values).length === 0) return existing;
        return db
          .updateTable("aimfox_sync_state")
          .set(values)
          .where("id", "=", existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return db
        .insertInto("aimfox_sync_state")
        .values(values as never)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async updateStatus(status: string, errorMessage?: string | null) {
      return this.upsert({
        status,
        errorMessage: errorMessage ?? null,
      });
    },

    async incrementCounters(counts: {
      leads?: number;
      messages?: number;
      contacts?: number;
      companies?: number;
    }) {
      const updates: string[] = [];
      if (counts.leads)
        updates.push(`leads_synced = leads_synced + ${counts.leads}`);
      if (counts.messages)
        updates.push(`messages_synced = messages_synced + ${counts.messages}`);
      if (counts.contacts)
        updates.push(`contacts_created = contacts_created + ${counts.contacts}`);
      if (counts.companies)
        updates.push(`companies_created = companies_created + ${counts.companies}`);

      if (updates.length === 0) return;

      await sql`UPDATE aimfox_sync_state SET ${sql.raw(updates.join(", "))}`.execute(db);
    },
  };
}
