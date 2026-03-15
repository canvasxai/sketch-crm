import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createFirefliesSyncStateRepository(db: Kysely<DB>) {
  return {
    async get() {
      return db
        .selectFrom("fireflies_sync_state")
        .selectAll()
        .limit(1)
        .executeTakeFirst();
    },

    async upsert(
      data: Partial<{
        status: string;
        lastSyncAt: string;
        errorMessage: string | null;
        transcriptsSynced: number;
        meetingsCreated: number;
        contactsMatched: number;
        syncPeriod: string;
        oldestTranscriptAt: string | null;
        newestTranscriptAt: string | null;
      }>,
    ) {
      const existing = await this.get();

      const values: Record<string, unknown> = {};
      if (data.status !== undefined) values.status = data.status;
      if (data.lastSyncAt !== undefined) values.last_sync_at = data.lastSyncAt;
      if (data.errorMessage !== undefined)
        values.error_message = data.errorMessage;
      if (data.transcriptsSynced !== undefined)
        values.transcripts_synced = data.transcriptsSynced;
      if (data.meetingsCreated !== undefined)
        values.meetings_created = data.meetingsCreated;
      if (data.contactsMatched !== undefined)
        values.contacts_matched = data.contactsMatched;
      if (data.syncPeriod !== undefined) values.sync_period = data.syncPeriod;
      if (data.oldestTranscriptAt !== undefined)
        values.oldest_transcript_at = data.oldestTranscriptAt;
      if (data.newestTranscriptAt !== undefined)
        values.newest_transcript_at = data.newestTranscriptAt;

      if (existing) {
        if (Object.keys(values).length === 0) return existing;
        values.updated_at = sql`now()`;
        return db
          .updateTable("fireflies_sync_state")
          .set(values)
          .where("id", "=", existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return db
        .insertInto("fireflies_sync_state")
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
      transcripts?: number;
      meetings?: number;
      contacts?: number;
    }) {
      const updates: string[] = [];
      if (counts.transcripts)
        updates.push(
          `transcripts_synced = transcripts_synced + ${counts.transcripts}`,
        );
      if (counts.meetings)
        updates.push(
          `meetings_created = meetings_created + ${counts.meetings}`,
        );
      if (counts.contacts)
        updates.push(
          `contacts_matched = contacts_matched + ${counts.contacts}`,
        );

      if (updates.length === 0) return;

      await sql`UPDATE fireflies_sync_state SET ${sql.raw(updates.join(", "))}, updated_at = now()`.execute(
        db,
      );
    },
  };
}
