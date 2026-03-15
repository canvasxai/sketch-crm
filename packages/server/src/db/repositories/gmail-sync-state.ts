import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createGmailSyncStateRepository(db: Kysely<DB>) {
  return {
    async findByUser(userId: string) {
      return db
        .selectFrom("gmail_sync_state")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    async upsert(
      userId: string,
      data: Partial<{
        status: string;
        lastSyncAt: string;
        syncHistoryId: string;
        errorMessage: string | null;
        emailsSynced: number;
        contactsCreated: number;
        companiesCreated: number;
        oldestEmailAt: string | null;
        newestEmailAt: string | null;
      }>,
    ) {
      const values: Record<string, unknown> = { user_id: userId };
      if (data.status !== undefined) values.status = data.status;
      if (data.lastSyncAt !== undefined) values.last_sync_at = data.lastSyncAt;
      if (data.syncHistoryId !== undefined)
        values.sync_history_id = data.syncHistoryId;
      if (data.errorMessage !== undefined)
        values.error_message = data.errorMessage;
      if (data.emailsSynced !== undefined)
        values.emails_synced = data.emailsSynced;
      if (data.contactsCreated !== undefined)
        values.contacts_created = data.contactsCreated;
      if (data.companiesCreated !== undefined)
        values.companies_created = data.companiesCreated;
      if (data.oldestEmailAt !== undefined)
        values.oldest_email_at = data.oldestEmailAt;
      if (data.newestEmailAt !== undefined)
        values.newest_email_at = data.newestEmailAt;

      const existing = await this.findByUser(userId);

      if (existing) {
        delete values.user_id;
        if (Object.keys(values).length === 0) return existing;
        return db
          .updateTable("gmail_sync_state")
          .set(values)
          .where("user_id", "=", userId)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return db
        .insertInto("gmail_sync_state")
        .values(values as never)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async updateStatus(
      userId: string,
      status: string,
      errorMessage?: string | null,
    ) {
      return this.upsert(userId, {
        status,
        errorMessage: errorMessage ?? null,
      });
    },

    async setSyncPeriod(userId: string, period: string) {
      const existing = await this.findByUser(userId);
      if (existing) {
        return db
          .updateTable("gmail_sync_state")
          .set({ sync_period: period })
          .where("user_id", "=", userId)
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      return db
        .insertInto("gmail_sync_state")
        .values({ user_id: userId, sync_period: period })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async setSyncFrequency(userId: string, frequency: string) {
      const existing = await this.findByUser(userId);
      if (existing) {
        return db
          .updateTable("gmail_sync_state")
          .set({ sync_frequency: frequency })
          .where("user_id", "=", userId)
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      return db
        .insertInto("gmail_sync_state")
        .values({ user_id: userId, sync_frequency: frequency })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async incrementCounters(
      userId: string,
      counts: {
        emails?: number;
        contacts?: number;
        companies?: number;
      },
    ) {
      const updates: string[] = [];
      if (counts.emails)
        updates.push(`emails_synced = emails_synced + ${counts.emails}`);
      if (counts.contacts)
        updates.push(
          `contacts_created = contacts_created + ${counts.contacts}`,
        );
      if (counts.companies)
        updates.push(
          `companies_created = companies_created + ${counts.companies}`,
        );

      if (updates.length === 0) return;

      await sql`UPDATE gmail_sync_state SET ${sql.raw(updates.join(", "))} WHERE user_id = ${userId}`.execute(
        db,
      );
    },
  };
}
