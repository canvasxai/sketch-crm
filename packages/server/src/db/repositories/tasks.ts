import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export interface TaskFilters {
  contactId?: string;
  companyId?: string;
  assigneeId?: string;
  completed?: boolean;
  limit?: number;
  offset?: number;
}

export function createTasksRepository(db: Kysely<DB>) {
  return {
    async list(filters: TaskFilters = {}) {
      let query = db
        .selectFrom("tasks")
        .leftJoin("users", "users.id", "tasks.assignee_id")
        .select([
          "tasks.id",
          "tasks.contact_id",
          "tasks.company_id",
          "tasks.title",
          "tasks.assignee_id",
          "users.name as assignee_name",
          "tasks.due_date",
          "tasks.completed",
          "tasks.completed_at",
          "tasks.created_by",
          "tasks.created_at",
          "tasks.updated_at",
        ])
        .orderBy("tasks.created_at", "desc");

      if (filters.contactId !== undefined) {
        query = query.where("tasks.contact_id", "=", filters.contactId);
      }
      if (filters.companyId !== undefined) {
        query = query.where("tasks.company_id", "=", filters.companyId);
      }
      if (filters.assigneeId !== undefined) {
        query = query.where("tasks.assignee_id", "=", filters.assigneeId);
      }
      if (filters.completed !== undefined) {
        query = query.where("tasks.completed", "=", filters.completed);
      }
      if (filters.limit !== undefined) {
        query = query.limit(filters.limit);
      }
      if (filters.offset !== undefined) {
        query = query.offset(filters.offset);
      }

      return query.execute();
    },

    async findById(id: string) {
      return db
        .selectFrom("tasks")
        .leftJoin("users", "users.id", "tasks.assignee_id")
        .select([
          "tasks.id",
          "tasks.contact_id",
          "tasks.company_id",
          "tasks.title",
          "tasks.assignee_id",
          "users.name as assignee_name",
          "tasks.due_date",
          "tasks.completed",
          "tasks.completed_at",
          "tasks.created_by",
          "tasks.created_at",
          "tasks.updated_at",
        ])
        .where("tasks.id", "=", id)
        .executeTakeFirst();
    },

    async create(data: {
      contactId?: string;
      companyId?: string;
      title: string;
      assigneeId?: string;
      dueDate?: string;
      createdBy?: string;
    }) {
      const task = await db
        .insertInto("tasks")
        .values({
          contact_id: data.contactId ?? null,
          company_id: data.companyId ?? null,
          title: data.title,
          assignee_id: data.assigneeId ?? null,
          due_date: data.dueDate ?? null,
          created_by: data.createdBy ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Re-fetch with join to get assignee name
      return this.findById(task.id);
    },

    async update(
      id: string,
      data: Partial<{
        title: string;
        assigneeId: string | null;
        dueDate: string | null;
        completed: boolean;
        contactId: string | null;
        companyId: string | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.title !== undefined) values.title = data.title;
      if (data.assigneeId !== undefined) values.assignee_id = data.assigneeId;
      if (data.dueDate !== undefined) values.due_date = data.dueDate;
      if (data.contactId !== undefined) values.contact_id = data.contactId;
      if (data.companyId !== undefined) values.company_id = data.companyId;
      if (data.completed !== undefined) {
        values.completed = data.completed;
        values.completed_at = data.completed ? new Date().toISOString() : null;
      }

      if (Object.keys(values).length === 0) {
        return this.findById(id);
      }

      await db
        .updateTable("tasks")
        .set(values)
        .where("id", "=", id)
        .execute();

      return this.findById(id);
    },

    async remove(id: string) {
      return db
        .deleteFrom("tasks")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
