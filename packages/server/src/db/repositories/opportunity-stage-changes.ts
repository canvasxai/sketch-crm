import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createOpportunityStageChangesRepository(db: Kysely<DB>) {
  return {
    /**
     * List stage changes for an opportunity (most recent first).
     */
    async list(opts: { opportunityId: string; limit?: number; offset?: number }) {
      let query = db
        .selectFrom("opportunity_stage_changes")
        .leftJoin("users", "users.id", "opportunity_stage_changes.changed_by")
        .leftJoin(
          "pipeline_stages as from_stage",
          "from_stage.id",
          "opportunity_stage_changes.from_stage_id",
        )
        .innerJoin(
          "pipeline_stages as to_stage",
          "to_stage.id",
          "opportunity_stage_changes.to_stage_id",
        )
        .select([
          "opportunity_stage_changes.id",
          "opportunity_stage_changes.opportunity_id",
          "opportunity_stage_changes.from_stage_id",
          "opportunity_stage_changes.to_stage_id",
          "opportunity_stage_changes.changed_by",
          "users.name as changed_by_name",
          "from_stage.label as from_stage_label",
          "to_stage.label as to_stage_label",
          "opportunity_stage_changes.created_at",
        ])
        .where("opportunity_stage_changes.opportunity_id", "=", opts.opportunityId)
        .orderBy("opportunity_stage_changes.created_at", "desc");

      if (opts.limit !== undefined) {
        query = query.limit(opts.limit);
      }
      if (opts.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      return query.execute();
    },

    /**
     * List stage changes for multiple opportunities (batch fetch for timelines).
     */
    async listByOpportunityIds(opportunityIds: string[]) {
      if (opportunityIds.length === 0) return [];

      return db
        .selectFrom("opportunity_stage_changes")
        .leftJoin("users", "users.id", "opportunity_stage_changes.changed_by")
        .leftJoin(
          "pipeline_stages as from_stage",
          "from_stage.id",
          "opportunity_stage_changes.from_stage_id",
        )
        .innerJoin(
          "pipeline_stages as to_stage",
          "to_stage.id",
          "opportunity_stage_changes.to_stage_id",
        )
        .select([
          "opportunity_stage_changes.id",
          "opportunity_stage_changes.opportunity_id",
          "opportunity_stage_changes.from_stage_id",
          "opportunity_stage_changes.to_stage_id",
          "opportunity_stage_changes.changed_by",
          "users.name as changed_by_name",
          "from_stage.label as from_stage_label",
          "to_stage.label as to_stage_label",
          "opportunity_stage_changes.created_at",
        ])
        .where("opportunity_stage_changes.opportunity_id", "in", opportunityIds)
        .orderBy("opportunity_stage_changes.created_at", "desc")
        .execute();
    },

    /**
     * Record a stage change.
     */
    async create(data: {
      opportunityId: string;
      fromStageId?: string | null;
      toStageId: string;
      changedBy?: string;
    }) {
      return db
        .insertInto("opportunity_stage_changes")
        .values({
          opportunity_id: data.opportunityId,
          from_stage_id: data.fromStageId ?? null,
          to_stage_id: data.toStageId,
          changed_by: data.changedBy ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
