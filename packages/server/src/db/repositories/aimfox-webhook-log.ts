import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createAimfoxWebhookLogRepository(db: Kysely<DB>) {
  return {
    async create(data: { eventType: string; payload: unknown }) {
      return db
        .insertInto("aimfox_webhook_log")
        .values({
          event_type: data.eventType,
          payload: JSON.stringify(data.payload),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async markProcessed(id: string) {
      return db
        .updateTable("aimfox_webhook_log")
        .set({ processed: true })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async markError(id: string, errorMessage: string) {
      return db
        .updateTable("aimfox_webhook_log")
        .set({ error_message: errorMessage })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
