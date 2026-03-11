import { Hono } from "hono";
import { z } from "zod";
import type { createMeetingsRepository } from "../db/repositories/meetings.js";
import { mapRow, mapRows } from "../lib/map-row.js";

type MeetingsRepo = ReturnType<typeof createMeetingsRepository>;

const createSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  meetingLink: z.string().url().optional(),
  startTime: z.string().min(1, "startTime is required"),
  endTime: z.string().optional(),
  attendees: z.string().optional(),
  notes: z.string().optional(),
  calendarEventId: z.string().optional(),
  source: z.string().optional(),
});

const updateSchema = z.object({
  contactId: z.string().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  meetingLink: z.string().url().nullable().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  attendees: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  calendarEventId: z.string().nullable().optional(),
  source: z.string().optional(),
});

export function meetingsRoutes(repo: MeetingsRepo) {
  const routes = new Hono();

  // List meetings (contactId required as query param)
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

    const meetings = await repo.list({ contactId, limit, offset });
    return c.json({ meetings: mapRows(meetings) });
  });

  // Get a single meeting
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const meeting = await repo.findById(id);

    if (!meeting) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Meeting not found" } },
        404,
      );
    }

    return c.json({ meeting: mapRow(meeting) });
  });

  // Create a meeting
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

    const meeting = await repo.create(parsed.data);
    return c.json({ meeting: mapRow(meeting) }, 201);
  });

  // Update a meeting
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
        { error: { code: "NOT_FOUND", message: "Meeting not found" } },
        404,
      );
    }

    const meeting = await repo.update(id, parsed.data);
    return c.json({ meeting: mapRow(meeting) });
  });

  // Delete a meeting
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Meeting not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
