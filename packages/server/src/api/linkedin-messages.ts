import { Hono } from "hono";
import { z } from "zod";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { Config } from "../config.js";
import { AimfoxClient, sanitizeForAimfox } from "../lib/aimfox-client.js";

type LinkedinMessagesRepo = ReturnType<typeof createLinkedinMessagesRepository>;

const createSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  messageText: z.string().optional(),
  conversationId: z.string().optional(),
  aimfoxMessageId: z.string().optional(),
  connectionStatus: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  sentAt: z.string().min(1, "sentAt is required"),
  source: z.string().optional(),
});

const updateSchema = z.object({
  contactId: z.string().optional(),
  messageText: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  aimfoxMessageId: z.string().nullable().optional(),
  connectionStatus: z.string().nullable().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  sentAt: z.string().optional(),
  source: z.string().optional(),
});

export function linkedinMessagesRoutes(
  repo: LinkedinMessagesRepo,
  deps?: {
    contacts: ReturnType<typeof createContactsRepository>;
    config: Config;
  },
) {
  const routes = new Hono();

  // List linkedin messages (contactId required as query param)
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

    const messages = await repo.list({ contactId, limit, offset });
    return c.json({ messages });
  });

  // Get a single linkedin message
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const message = await repo.findById(id);

    if (!message) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "LinkedIn message not found" } },
        404,
      );
    }

    return c.json({ message });
  });

  // Create a linkedin message
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

    const message = await repo.create(parsed.data);
    return c.json({ message }, 201);
  });

  // Update a linkedin message
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
        { error: { code: "NOT_FOUND", message: "LinkedIn message not found" } },
        404,
      );
    }

    const message = await repo.update(id, parsed.data);
    return c.json({ message });
  });

  // Delete a linkedin message
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "LinkedIn message not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  // POST /send — send a LinkedIn message via AimFox
  routes.post("/send", async (c) => {
    if (!deps) {
      return c.json({ error: { code: "SERVER_ERROR", message: "Send not configured" } }, 500);
    }

    const body = await c.req.json();
    const parsed = z
      .object({
        contactId: z.string().min(1, "contactId is required"),
        messageText: z.string().min(1, "messageText is required"),
      })
      .safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join(", ") } },
        400,
      );
    }

    if (!deps.config.AIMFOX_API_KEY) {
      return c.json({ error: { code: "SERVER_ERROR", message: "AIMFOX_API_KEY not configured" } }, 500);
    }

    const contact = await deps.contacts.findById(parsed.data.contactId);
    if (!contact) {
      return c.json({ error: { code: "NOT_FOUND", message: "Contact not found" } }, 404);
    }
    if (!contact.aimfox_lead_id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Contact has no AimFox lead ID — can only send to AimFox campaign leads" } }, 400);
    }

    // Get the lead's URN from AimFox (needed as recipient)
    const client = new AimfoxClient(deps.config.AIMFOX_API_KEY, deps.config.AIMFOX_ACCOUNT_ID);
    const lead = await client.getLead(contact.aimfox_lead_id);

    const result = await client.sendMessage([lead.urn], parsed.data.messageText);

    // Record outbound message in DB
    const message = await repo.create({
      contactId: contact.id,
      messageText: sanitizeForAimfox(parsed.data.messageText),
      conversationId: result.conversation_urn ?? undefined,
      direction: "outbound",
      sentAt: result.created_at ? new Date(result.created_at).toISOString() : new Date().toISOString(),
      source: "aimfox",
    });

    return c.json({ message, aimfoxResult: result }, 201);
  });

  return routes;
}
