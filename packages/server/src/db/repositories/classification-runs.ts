import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createClassificationRunsRepository(db: Kysely<DB>) {
  return {
    async create(totalContacts: number) {
      return db
        .insertInto("classification_runs")
        .values({ total_contacts: totalContacts })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async findById(id: string) {
      return db
        .selectFrom("classification_runs")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findAll(limit = 20) {
      return db
        .selectFrom("classification_runs")
        .selectAll()
        .orderBy("started_at", "desc")
        .limit(limit)
        .execute();
    },

    async findLatest() {
      return db
        .selectFrom("classification_runs")
        .selectAll()
        .orderBy("started_at", "desc")
        .limit(1)
        .executeTakeFirst();
    },

    async findRunning() {
      return db
        .selectFrom("classification_runs")
        .selectAll()
        .where("status", "=", "running")
        .executeTakeFirst();
    },

    async incrementProcessed(id: string, categoryChanged: boolean) {
      const update: Record<string, unknown> = {
        processed_contacts: sql`processed_contacts + 1`,
      };
      if (categoryChanged) {
        update.category_changes = sql`category_changes + 1`;
      }
      return db
        .updateTable("classification_runs")
        .set(update)
        .where("id", "=", id)
        .execute();
    },

    async incrementErrors(id: string) {
      return db
        .updateTable("classification_runs")
        .set({
          errors: sql`errors + 1`,
          processed_contacts: sql`processed_contacts + 1`,
        })
        .where("id", "=", id)
        .execute();
    },

    async complete(id: string) {
      return db
        .updateTable("classification_runs")
        .set({ status: "completed", completed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    },

    async cancel(id: string) {
      return db
        .updateTable("classification_runs")
        .set({ status: "cancelled", completed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    },

    async fail(id: string) {
      return db
        .updateTable("classification_runs")
        .set({ status: "failed", completed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    },
  };
}
