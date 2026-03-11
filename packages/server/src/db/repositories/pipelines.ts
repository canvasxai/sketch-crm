import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createPipelinesRepository(db: Kysely<DB>) {
  return {
    /**
     * List all pipelines ordered by position.
     */
    async list() {
      return db
        .selectFrom("pipelines")
        .selectAll()
        .orderBy("position", "asc")
        .execute();
    },

    /**
     * Get a single pipeline by ID.
     */
    async findById(id: string) {
      return db
        .selectFrom("pipelines")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Get a pipeline by name.
     */
    async findByName(name: string) {
      return db
        .selectFrom("pipelines")
        .selectAll()
        .where("name", "=", name)
        .executeTakeFirst();
    },

    /**
     * Create a new pipeline.
     */
    async create(data: { name: string; position?: number }) {
      return db
        .insertInto("pipelines")
        .values({
          name: data.name,
          ...(data.position !== undefined ? { position: data.position } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Update a pipeline.
     */
    async update(id: string, data: Partial<{ name: string; position: number }>) {
      const values: Record<string, unknown> = {};
      if (data.name !== undefined) values.name = data.name;
      if (data.position !== undefined) values.position = data.position;

      if (Object.keys(values).length === 0) {
        return db.selectFrom("pipelines").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
      }

      return db
        .updateTable("pipelines")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Delete a pipeline by ID. Cascade-deletes stages and orphans opportunities.
     */
    async remove(id: string) {
      return db
        .deleteFrom("pipelines")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
