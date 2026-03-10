import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createNotesRepository(db: Kysely<DB>) {
  return {
    async list(opts?: {
      contactId?: string;
      createdBy?: string;
      limit?: number;
      offset?: number;
    }) {
      let query = db
        .selectFrom("notes")
        .selectAll()
        .orderBy("created_at", "desc");

      if (opts?.contactId !== undefined) {
        query = query.where("contact_id", "=", opts.contactId);
      }

      if (opts?.createdBy !== undefined) {
        query = query.where("created_by", "=", opts.createdBy);
      }

      if (opts?.limit !== undefined) {
        query = query.limit(opts.limit);
      }

      if (opts?.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      return query.execute();
    },

    async findById(id: string) {
      return db
        .selectFrom("notes")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async create(data: {
      contactId: string;
      title?: string;
      content: string;
      createdBy?: string;
    }) {
      return db
        .insertInto("notes")
        .values({
          contact_id: data.contactId,
          title: data.title ?? null,
          content: data.content,
          created_by: data.createdBy ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        contactId: string;
        title: string | null;
        content: string;
        createdBy: string | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.contactId !== undefined) values.contact_id = data.contactId;
      if (data.title !== undefined) values.title = data.title;
      if (data.content !== undefined) values.content = data.content;
      if (data.createdBy !== undefined) values.created_by = data.createdBy;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("notes")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("notes")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async remove(id: string) {
      return db
        .deleteFrom("notes")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
