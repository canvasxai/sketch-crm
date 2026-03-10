/**
 * Webhook ingress endpoints — receives events from external services.
 * Mounted outside /api/* so auth middleware does not apply.
 */
import { Hono } from "hono";
import type { Config } from "../config.js";
import type { createAimfoxSyncStateRepository } from "../db/repositories/aimfox-sync-state.js";
import type { createAimfoxWebhookLogRepository } from "../db/repositories/aimfox-webhook-log.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { AimfoxWebhookPayload } from "../lib/aimfox-client.js";
import { processConnectionAccept } from "../lib/aimfox-sync.js";

interface WebhookDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  linkedinMessages: ReturnType<typeof createLinkedinMessagesRepository>;
  aimfoxSyncState: ReturnType<typeof createAimfoxSyncStateRepository>;
  aimfoxWebhookLog: ReturnType<typeof createAimfoxWebhookLogRepository>;
  config: Config;
}

export function webhookRoutes(deps: WebhookDeps) {
  const routes = new Hono();

  // POST /aimfox?secret=<AIMFOX_WEBHOOK_SECRET>
  // AimFox doesn't send auth headers — verify via query param.
  routes.post("/aimfox", async (c) => {
    const secret = c.req.query("secret");
    if (!deps.config.AIMFOX_WEBHOOK_SECRET || secret !== deps.config.AIMFOX_WEBHOOK_SECRET) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const payload: AimfoxWebhookPayload = await c.req.json();

    // Log every webhook before processing
    const logEntry = await deps.aimfoxWebhookLog.create({
      eventType: payload.event_type,
      payload,
    });

    try {
      if (payload.event_type === "accepted" || payload.event_type === "replied") {
        await processConnectionAccept(payload, deps);
      } else {
        // Unknown event type — logged for future handling
        console.log(`[aimfox-webhook] Unknown event type: ${payload.event_type}`);
      }

      await deps.aimfoxWebhookLog.markProcessed(logEntry.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[aimfox-webhook] Error processing ${payload.event_type}:`, message);
      await deps.aimfoxWebhookLog.markError(logEntry.id, message);
    }

    // Always return 200 to AimFox so it doesn't retry
    return c.json({ ok: true });
  });

  return routes;
}
