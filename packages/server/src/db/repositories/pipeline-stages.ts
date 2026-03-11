import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createPipelineStagesRepository(db: Kysely<DB>) {
  return {
    /**
     * List all stages for a pipeline, ordered by position.
     */
    async listByPipeline(pipelineId: string) {
      return db
        .selectFrom("pipeline_stages")
        .selectAll()
        .where("pipeline_id", "=", pipelineId)
        .orderBy("position", "asc")
        .execute();
    },

    /**
     * List all stages across all pipelines (for bulk lookups).
     */
    async listAll() {
      return db
        .selectFrom("pipeline_stages")
        .selectAll()
        .orderBy("pipeline_id", "asc")
        .orderBy("position", "asc")
        .execute();
    },

    /**
     * Get a single stage by ID.
     */
    async findById(id: string) {
      return db
        .selectFrom("pipeline_stages")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Create a new stage in a pipeline.
     */
    async create(data: {
      pipelineId: string;
      label: string;
      stageType?: string;
      position?: number;
    }) {
      return db
        .insertInto("pipeline_stages")
        .values({
          pipeline_id: data.pipelineId,
          label: data.label,
          ...(data.stageType !== undefined ? { stage_type: data.stageType } : {}),
          ...(data.position !== undefined ? { position: data.position } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Update a stage.
     */
    async update(
      id: string,
      data: Partial<{ label: string; stageType: string; position: number }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.label !== undefined) values.label = data.label;
      if (data.stageType !== undefined) values.stage_type = data.stageType;
      if (data.position !== undefined) values.position = data.position;

      if (Object.keys(values).length === 0) {
        return db.selectFrom("pipeline_stages").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
      }

      return db
        .updateTable("pipeline_stages")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Delete a stage by ID.
     */
    async remove(id: string) {
      return db
        .deleteFrom("pipeline_stages")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
