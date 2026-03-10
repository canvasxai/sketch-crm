import { Hono } from "hono";
import { z } from "zod";
import type { createUsersRepository } from "../db/repositories/users.js";

type UsersRepo = ReturnType<typeof createUsersRepository>;

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  googleId: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  googleId: z.string().nullable().optional(),
});

export function usersRoutes(repo: UsersRepo) {
  const routes = new Hono();

  // List all users
  routes.get("/", async (c) => {
    const users = await repo.list();
    return c.json({ users });
  });

  // Create a new user
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

    try {
      const user = await repo.create(parsed.data);
      return c.json({ user }, 201);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("duplicate key")
      ) {
        return c.json(
          {
            error: {
              code: "DUPLICATE",
              message: "A user with this email already exists",
            },
          },
          409,
        );
      }
      throw err;
    }
  });

  // Update a user
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
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }

    const user = await repo.update(id, parsed.data);
    return c.json({ user });
  });

  // Delete a user
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
