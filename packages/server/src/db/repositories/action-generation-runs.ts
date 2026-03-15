import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createActionGenerationRunsRepository(db: Kysely<DB>) {
  return {
    async create(totalContacts: number) {
      return db
        .insertInto("action_generation_runs")
        .values({ total_contacts: totalContacts })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async findById(id: string) {
      return db
        .selectFrom("action_generation_runs")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findAll(limit = 20) {
      return db
        .selectFrom("action_generation_runs")
        .selectAll()
        .orderBy("started_at", "desc")
        .limit(limit)
        .execute();
    },

    async findLatest() {
      return db
        .selectFrom("action_generation_runs")
        .selectAll()
        .orderBy("started_at", "desc")
        .limit(1)
        .executeTakeFirst();
    },

    async findRunning() {
      return db
        .selectFrom("action_generation_runs")
        .selectAll()
        .where("status", "=", "running")
        .executeTakeFirst();
    },

    async incrementProcessed(id: string, tasksCreated: number) {
      const update: Record<string, unknown> = {
        processed_contacts: sql`processed_contacts + 1`,
      };
      if (tasksCreated > 0) {
        update.tasks_created = sql`tasks_created + ${tasksCreated}`;
      }
      return db
        .updateTable("action_generation_runs")
        .set(update)
        .where("id", "=", id)
        .execute();
    },

    async incrementErrors(id: string) {
      return db
        .updateTable("action_generation_runs")
        .set({
          errors: sql`errors + 1`,
          processed_contacts: sql`processed_contacts + 1`,
        })
        .where("id", "=", id)
        .execute();
    },

    async complete(id: string) {
      return db
        .updateTable("action_generation_runs")
        .set({ status: "completed", completed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    },

    async cancel(id: string) {
      return db
        .updateTable("action_generation_runs")
        .set({ status: "cancelled", completed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    },

    async fail(id: string) {
      return db
        .updateTable("action_generation_runs")
        .set({ status: "failed", completed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    },
  };
}
