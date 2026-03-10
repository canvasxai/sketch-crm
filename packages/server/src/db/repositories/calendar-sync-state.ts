import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createCalendarSyncStateRepository(db: Kysely<DB>) {
  return {
    async findByUser(userId: string) {
      return db
        .selectFrom("calendar_sync_state")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    async upsert(
      userId: string,
      data: Partial<{
        status: string;
        lastSyncAt: string;
        syncToken: string;
        errorMessage: string | null;
        eventsSynced: number;
        contactsCreated: number;
        meetingsCreated: number;
      }>,
    ) {
      const existing = await this.findByUser(userId);

      if (existing) {
        const update: Record<string, unknown> = {};
        if (data.status !== undefined) update.status = data.status;
        if (data.lastSyncAt !== undefined) update.last_sync_at = data.lastSyncAt;
        if (data.syncToken !== undefined) update.sync_token = data.syncToken;
        if (data.errorMessage !== undefined) update.error_message = data.errorMessage;
        if (data.eventsSynced !== undefined) update.events_synced = data.eventsSynced;
        if (data.contactsCreated !== undefined) update.contacts_created = data.contactsCreated;
        if (data.meetingsCreated !== undefined) update.meetings_created = data.meetingsCreated;
        if (Object.keys(update).length === 0) return existing;
        return db
          .updateTable("calendar_sync_state")
          .set(update)
          .where("user_id", "=", userId)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return db
        .insertInto("calendar_sync_state")
        .values({
          user_id: userId,
          ...(data.status !== undefined && { status: data.status }),
          ...(data.lastSyncAt !== undefined && { last_sync_at: data.lastSyncAt }),
          ...(data.syncToken !== undefined && { sync_token: data.syncToken }),
          ...(data.errorMessage !== undefined && { error_message: data.errorMessage }),
          ...(data.eventsSynced !== undefined && { events_synced: data.eventsSynced }),
          ...(data.contactsCreated !== undefined && { contacts_created: data.contactsCreated }),
          ...(data.meetingsCreated !== undefined && { meetings_created: data.meetingsCreated }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async setSyncPeriod(userId: string, period: string) {
      const existing = await this.findByUser(userId);
      if (existing) {
        return db
          .updateTable("calendar_sync_state")
          .set({ sync_period: period })
          .where("user_id", "=", userId)
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      return db
        .insertInto("calendar_sync_state")
        .values({ user_id: userId, sync_period: period })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async setSyncFrequency(userId: string, frequency: string) {
      const existing = await this.findByUser(userId);
      if (existing) {
        return db
          .updateTable("calendar_sync_state")
          .set({ sync_frequency: frequency })
          .where("user_id", "=", userId)
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      return db
        .insertInto("calendar_sync_state")
        .values({ user_id: userId, sync_frequency: frequency })
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
