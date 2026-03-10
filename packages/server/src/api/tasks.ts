import { Hono } from "hono";
import { z } from "zod";
import type { createTasksRepository } from "../db/repositories/tasks.js";

type TasksRepo = ReturnType<typeof createTasksRepository>;

const createSchema = z.object({
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  createdBy: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
});

export function tasksRoutes(repo: TasksRepo) {
  const routes = new Hono();

  // List tasks with filters
  routes.get("/", async (c) => {
    const filters = {
      contactId: c.req.query("contactId"),
      companyId: c.req.query("companyId"),
      assigneeId: c.req.query("assigneeId"),
      completed: c.req.query("completed") !== undefined
        ? c.req.query("completed") === "true"
        : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
    };

    const tasks = await repo.list(filters);
    return c.json({ tasks });
  });

  // Get a single task
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const task = await repo.findById(id);

    if (!task) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Task not found" } },
        404,
      );
    }

    return c.json({ task });
  });

  // Create a task
  routes.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      );
    }

    const task = await repo.create(parsed.data);
    return c.json({ task }, 201);
  });

  // Update a task
  routes.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      );
    }

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Task not found" } },
        404,
      );
    }

    const task = await repo.update(id, parsed.data);
    return c.json({ task });
  });

  // Delete a task
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Task not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
