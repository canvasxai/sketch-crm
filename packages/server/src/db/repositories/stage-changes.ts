import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createStageChangesRepository(db: Kysely<DB>) {
  return {
    async list(opts: { contactId: string; limit?: number; offset?: number }) {
      let query = db
        .selectFrom("stage_changes")
        .leftJoin("users", "users.id", "stage_changes.changed_by")
        .select([
          "stage_changes.id",
          "stage_changes.contact_id",
          "stage_changes.from_stage",
          "stage_changes.to_stage",
          "stage_changes.changed_by",
          "users.name as changed_by_name",
          "stage_changes.created_at",
        ])
        .where("stage_changes.contact_id", "=", opts.contactId)
        .orderBy("stage_changes.created_at", "desc");

      if (opts.limit !== undefined) {
        query = query.limit(opts.limit);
      }
      if (opts.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      return query.execute();
    },

    async listByContactIds(contactIds: string[]) {
      if (contactIds.length === 0) return [];

      return db
        .selectFrom("stage_changes")
        .leftJoin("users", "users.id", "stage_changes.changed_by")
        .select([
          "stage_changes.id",
          "stage_changes.contact_id",
          "stage_changes.from_stage",
          "stage_changes.to_stage",
          "stage_changes.changed_by",
          "users.name as changed_by_name",
          "stage_changes.created_at",
        ])
        .where("stage_changes.contact_id", "in", contactIds)
        .orderBy("stage_changes.created_at", "desc")
        .execute();
    },

    async create(data: {
      contactId: string;
      fromStage: string;
      toStage: string;
      changedBy?: string;
    }) {
      return db
        .insertInto("stage_changes")
        .values({
          contact_id: data.contactId,
          from_stage: data.fromStage,
          to_stage: data.toStage,
          changed_by: data.changedBy ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
