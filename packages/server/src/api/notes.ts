import { Hono } from "hono";
import { z } from "zod";
import type { createNotesRepository } from "../db/repositories/notes.js";
import { mapRow, mapRows } from "../lib/map-row.js";

type NotesRepo = ReturnType<typeof createNotesRepository>;

const createSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  title: z.string().optional(),
  content: z.string().min(1, "content is required"),
  createdBy: z.string().optional(),
});

const updateSchema = z.object({
  contactId: z.string().optional(),
  title: z.string().nullable().optional(),
  content: z.string().min(1).optional(),
  createdBy: z.string().nullable().optional(),
});

export function notesRoutes(repo: NotesRepo) {
  const routes = new Hono();

  // List notes (contactId required as query param)
  routes.get("/", async (c) => {
    const contactId = c.req.query("contactId");

    if (!contactId) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Query parameter 'contactId' is required",
          },
        },
        400,
      );
    }

    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const offset = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;
    const createdBy = c.req.query("createdBy");

    const notes = await repo.list({ contactId, createdBy, limit, offset });
    return c.json({ notes: mapRows(notes) });
  });

  // Get a single note
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const note = await repo.findById(id);

    if (!note) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Note not found" } },
        404,
      );
    }

    return c.json({ note: mapRow(note) });
  });

  // Create a note
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

    const note = await repo.create(parsed.data);
    return c.json({ note: mapRow(note) }, 201);
  });

  // Update a note
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
        { error: { code: "NOT_FOUND", message: "Note not found" } },
        404,
      );
    }

    const note = await repo.update(id, parsed.data);
    return c.json({ note: mapRow(note) });
  });

  // Delete a note
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Note not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
