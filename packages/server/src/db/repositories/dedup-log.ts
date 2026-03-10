import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createDedupLogRepository(db: Kysely<DB>) {
  return {
    async create(data: {
      contactId: string;
      mergedEmail: string;
      mergedName?: string;
      matchReason: string;
      aiConfidence?: string;
    }) {
      return db
        .insertInto("dedup_log")
        .values({
          contact_id: data.contactId,
          merged_email: data.mergedEmail,
          merged_name: data.mergedName ?? null,
          match_reason: data.matchReason,
          ai_confidence: data.aiConfidence ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async listByContact(contactId: string) {
      return db
        .selectFrom("dedup_log")
        .selectAll()
        .where("contact_id", "=", contactId)
        .orderBy("created_at", "desc")
        .execute();
    },

    async listUnreviewed(limit = 50) {
      return db
        .selectFrom("dedup_log")
        .selectAll()
        .where("reviewed", "=", false)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
    },

    async markReviewed(id: string) {
      return db
        .updateTable("dedup_log")
        .set({ reviewed: true })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
