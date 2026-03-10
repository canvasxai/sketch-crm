import { Hono } from "hono";
import { z } from "zod";
import type { createEmailsRepository } from "../db/repositories/emails.js";

type EmailsRepo = ReturnType<typeof createEmailsRepository>;

const createSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  subject: z.string().optional(),
  body: z.string().optional(),
  fromEmail: z.string().email().optional(),
  toEmail: z.string().email().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  sentAt: z.string().min(1, "sentAt is required"),
  source: z.string().min(1, "source is required"),
});

const updateSchema = z.object({
  contactId: z.string().optional(),
  subject: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  fromEmail: z.string().email().nullable().optional(),
  toEmail: z.string().email().nullable().optional(),
  cc: z.string().nullable().optional(),
  bcc: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  inReplyTo: z.string().nullable().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  sentAt: z.string().optional(),
  source: z.string().optional(),
});

export function emailsRoutes(repo: EmailsRepo) {
  const routes = new Hono();

  // List emails (contactId required as query param)
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

    const emails = await repo.list({ contactId, limit, offset });
    return c.json({ emails });
  });

  // Get a single email
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const email = await repo.findById(id);

    if (!email) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Email not found" } },
        404,
      );
    }

    return c.json({ email });
  });

  // Create an email
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

    const email = await repo.create(parsed.data);
    return c.json({ email }, 201);
  });

  // Update an email
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
        { error: { code: "NOT_FOUND", message: "Email not found" } },
        404,
      );
    }

    const email = await repo.update(id, parsed.data);
    return c.json({ email });
  });

  // Delete an email
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Email not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
