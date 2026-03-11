import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJwt } from "../auth/jwt.js";
import type { Config } from "../config.js";
import type { createCalendarSyncStateRepository } from "../db/repositories/calendar-sync-state.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createGmailSyncStateRepository } from "../db/repositories/gmail-sync-state.js";
import type { createOrgSettingsRepository } from "../db/repositories/org-settings.js";
import type { createUsersRepository } from "../db/repositories/users.js";
import type { createMutedDomainsRepository } from "../db/repositories/muted-domains.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createAimfoxSyncStateRepository } from "../db/repositories/aimfox-sync-state.js";
import type { createAimfoxWebhookLogRepository } from "../db/repositories/aimfox-webhook-log.js";
import { syncGmailEmails } from "../lib/gmail-sync.js";
import { syncConversation, backfillAimfoxLeads, cancelAimfoxBackfill } from "../lib/aimfox-sync.js";
import { SESSION_COOKIE } from "./auth.js";

interface IntegrationDeps {
  users: ReturnType<typeof createUsersRepository>;
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  linkedinMessages: ReturnType<typeof createLinkedinMessagesRepository>;
  gmailSyncState: ReturnType<typeof createGmailSyncStateRepository>;
  calendarSyncState: ReturnType<typeof createCalendarSyncStateRepository>;
  orgSettings: ReturnType<typeof createOrgSettingsRepository>;
  mutedDomains: ReturnType<typeof createMutedDomainsRepository>;
  aimfoxSyncState: ReturnType<typeof createAimfoxSyncStateRepository>;
  aimfoxWebhookLog: ReturnType<typeof createAimfoxWebhookLogRepository>;
  config: Config;
}

const VALID_SYNC_PERIODS = ["1month", "3months", "6months", "1year", "all"] as const;

async function getUserEmail(c: { req: { raw: Request }; json: Function }, config: Config): Promise<string | null> {
  const cookie = getCookie(c as never, SESSION_COOKIE);
  if (!cookie) return null;
  const payload = await verifyJwt(cookie, config.JWT_SECRET);
  return payload?.email ?? null;
}

export function integrationsRoutes(deps: IntegrationDeps) {
  const routes = new Hono();

  // GET /source-status — unified source sync status for all sources
  routes.get("/source-status", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);
    if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

    // Gmail status from gmail_sync_state table + token check
    const hasToken = !!(user as Record<string, unknown>).google_access_token;
    const gmailState = await deps.gmailSyncState.findByUser(user.id);
    const gmailStateExt = gmailState as Record<string, unknown> | undefined;

    // Calendar status from calendar_sync_state table
    const calendarState = await deps.calendarSyncState.findByUser(user.id);

    // Latest contact created_at per source
    const latestBySource = await deps.contacts.latestBySource();

    // AimFox sync state
    const aimfoxState = await deps.aimfoxSyncState.get();

    return c.json({
      gmail: {
        connected: hasToken,
        lastSyncAt: gmailState?.last_sync_at ?? null,
        status: gmailState?.status ?? "idle",
        errorMessage: gmailState?.error_message ?? null,
        emailsSynced: gmailState?.emails_synced ?? 0,
        contactsCreated: gmailState?.contacts_created ?? 0,
        companiesCreated: gmailState?.companies_created ?? 0,
        syncFrequency: gmailStateExt?.sync_frequency ?? "manual",
        syncPeriod: gmailStateExt?.sync_period ?? "3months",
      },
      linkedin: {
        connected: !!deps.config.AIMFOX_API_KEY,
        lastLeadAt: latestBySource.linkedin ?? null,
        status: aimfoxState?.status ?? "idle",
        lastSyncAt: aimfoxState?.last_sync_at ?? null,
        errorMessage: aimfoxState?.error_message ?? null,
        leadsSynced: aimfoxState?.leads_synced ?? 0,
        contactsCreated: aimfoxState?.contacts_created ?? 0,
        companiesCreated: aimfoxState?.companies_created ?? 0,
      },
      canvas_signup: {
        connected: false,
        lastLeadAt: latestBySource.canvas_signup ?? null,
      },
      google_calendar: {
        connected: hasToken, // shares same Google OAuth
        lastSyncAt: (calendarState?.last_sync_at as string) ?? null,
        lastLeadAt: latestBySource.google_calendar ?? null,
        status: (calendarState?.status as string) ?? "idle",
        errorMessage: (calendarState?.error_message as string) ?? null,
        eventsSynced: (calendarState?.events_synced as number) ?? 0,
        contactsCreated: (calendarState?.contacts_created as number) ?? 0,
        meetingsCreated: (calendarState?.meetings_created as number) ?? 0,
        syncFrequency: (calendarState?.sync_frequency as string) ?? "manual",
        syncPeriod: (calendarState?.sync_period as string) ?? "3months",
      },
    });
  });

  // GET /gmail/status — check Gmail connection and sync state
  routes.get("/gmail/status", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);

    if (!user) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        },
        404,
      );
    }

    const hasToken = !!(user as Record<string, unknown>).google_access_token;
    const syncState = await deps.gmailSyncState.findByUser(user.id);

    return c.json({
      hasToken,
      syncState: syncState
        ? {
            lastSyncAt: syncState.last_sync_at,
            status: syncState.status,
            errorMessage: syncState.error_message,
            emailsSynced: syncState.emails_synced,
            contactsCreated: syncState.contacts_created,
            companiesCreated: syncState.companies_created,
          }
        : null,
    });
  });

  // POST /gmail/sync — trigger email sync
  routes.post("/gmail/sync", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);

    if (!user) {
      return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    }

    const body = await c.req.json<{ syncPeriod?: string }>().catch(() => ({ syncPeriod: undefined }));
    const syncPeriod = body.syncPeriod ?? "3months";

    if (!VALID_SYNC_PERIODS.includes(syncPeriod as (typeof VALID_SYNC_PERIODS)[number])) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid syncPeriod. Must be one of: ${VALID_SYNC_PERIODS.join(", ")}`,
          },
        },
        400,
      );
    }

    const result = await syncGmailEmails(deps, deps.config, user.id, syncPeriod as (typeof VALID_SYNC_PERIODS)[number]);

    return c.json({ result });
  });

  // PUT /gmail/sync-frequency — update Gmail sync frequency
  routes.put("/gmail/sync-frequency", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);
    if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

    const body = await c.req.json<{ frequency?: string }>().catch(() => ({ frequency: undefined }));
    const validFrequencies = ["15min", "hourly", "daily", "manual"] as const;
    const frequency = body.frequency;
    if (!frequency || !validFrequencies.includes(frequency as (typeof validFrequencies)[number])) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`,
          },
        },
        400,
      );
    }

    await deps.gmailSyncState.setSyncFrequency(user.id, frequency);
    return c.json({ success: true });
  });

  // PUT /gmail/sync-period — update Gmail sync period (how far back to pull)
  routes.put("/gmail/sync-period", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);
    if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

    const body = await c.req.json<{ period?: string }>().catch(() => ({ period: undefined }));
    const period = body.period;
    if (!period || !VALID_SYNC_PERIODS.includes(period as (typeof VALID_SYNC_PERIODS)[number])) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid period. Must be one of: ${VALID_SYNC_PERIODS.join(", ")}`,
          },
        },
        400,
      );
    }

    await deps.gmailSyncState.setSyncPeriod(user.id, period);
    return c.json({ success: true });
  });

  // PUT /calendar/sync-period — update Calendar sync period
  routes.put("/calendar/sync-period", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);
    if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

    const body = await c.req.json<{ period?: string }>().catch(() => ({ period: undefined }));
    const period = body.period;
    if (!period || !VALID_SYNC_PERIODS.includes(period as (typeof VALID_SYNC_PERIODS)[number])) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid period. Must be one of: ${VALID_SYNC_PERIODS.join(", ")}`,
          },
        },
        400,
      );
    }

    await deps.calendarSyncState.setSyncPeriod(user.id, period);
    return c.json({ success: true });
  });

  // PUT /calendar/sync-frequency — update Calendar sync frequency
  routes.put("/calendar/sync-frequency", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);
    if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

    const body = await c.req.json<{ frequency?: string }>().catch(() => ({ frequency: undefined }));
    const validFrequencies = ["15min", "hourly", "daily", "manual"] as const;
    const frequency = body.frequency;
    if (!frequency || !validFrequencies.includes(frequency as (typeof validFrequencies)[number])) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`,
          },
        },
        400,
      );
    }

    await deps.calendarSyncState.setSyncFrequency(user.id, frequency);
    return c.json({ success: true });
  });

  // GET /gmail/sync/cron — cron endpoint for automated sync
  routes.get("/gmail/sync/cron", async (c) => {
    // Verify cron secret
    const cronSecret = deps.config.CRON_SECRET;
    if (cronSecret) {
      const authHeader = c.req.header("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, 401);
      }
    }

    // Sync all users with Gmail tokens
    const allUsers = await deps.users.list();
    const results: Array<{
      userId: string;
      email: string;
      result?: Awaited<ReturnType<typeof syncGmailEmails>>;
      error?: string;
    }> = [];

    for (const user of allUsers) {
      const u = user as Record<string, unknown>;
      if (!u.google_access_token) continue;

      // Respect sync_frequency — skip users with "manual" frequency
      const syncState = await deps.gmailSyncState.findByUser(user.id);
      const frequency = (syncState as Record<string, unknown>)?.sync_frequency ?? "manual";
      if (frequency === "manual") continue;

      try {
        const result = await syncGmailEmails(
          deps,
          deps.config,
          user.id,
          "1month", // Incremental sync — last month
        );
        results.push({ userId: user.id, email: user.email, result });
      } catch (err) {
        results.push({
          userId: user.id,
          email: user.email,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return c.json({ results });
  });

  // ── AimFox (LinkedIn automation) ──

  // GET /aimfox/status — sync state + stats
  routes.get("/aimfox/status", async (c) => {
    const syncState = await deps.aimfoxSyncState.get();
    const connected = !!deps.config.AIMFOX_API_KEY;

    return c.json({
      connected,
      status: syncState?.status ?? "idle",
      lastSyncAt: syncState?.last_sync_at ?? null,
      lastWebhookAt: syncState?.last_webhook_at ?? null,
      errorMessage: syncState?.error_message ?? null,
      leadsSynced: syncState?.leads_synced ?? 0,
      messagesSynced: syncState?.messages_synced ?? 0,
      contactsCreated: syncState?.contacts_created ?? 0,
      companiesCreated: syncState?.companies_created ?? 0,
      lastBackfillCursor: syncState?.last_backfill_cursor ?? null,
    });
  });

  // POST /aimfox/sync-conversation — sync a single contact's LinkedIn messages
  routes.post("/aimfox/sync-conversation", async (c) => {
    const body = await c.req.json<{ contactId?: string }>().catch(() => ({ contactId: undefined }));
    if (!body.contactId) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "contactId is required" } }, 400);
    }

    const contact = await deps.contacts.findById(body.contactId);
    if (!contact) {
      return c.json({ error: { code: "NOT_FOUND", message: "Contact not found" } }, 404);
    }
    if (!contact.aimfox_lead_id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Contact has no AimFox lead ID" } }, 400);
    }

    const result = await syncConversation(contact.id, contact.aimfox_lead_id, {
      contacts: deps.contacts,
      companies: deps.companies,
      linkedinMessages: deps.linkedinMessages,
      aimfoxSyncState: deps.aimfoxSyncState,
      aimfoxWebhookLog: deps.aimfoxWebhookLog,
      config: deps.config,
    });

    return c.json({ result });
  });

  // POST /aimfox/backfill — trigger bulk lead import
  routes.post("/aimfox/backfill", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    const user = userEmail ? await deps.users.findByEmail(userEmail) : null;
    const body = await c.req.json<{ batchSize?: number; syncConversations?: boolean; maxLeads?: number }>().catch(() => ({ batchSize: undefined, syncConversations: undefined, maxLeads: undefined }));

    const result = await backfillAimfoxLeads(
      {
        contacts: deps.contacts,
        companies: deps.companies,
        linkedinMessages: deps.linkedinMessages,
        aimfoxSyncState: deps.aimfoxSyncState,
        aimfoxWebhookLog: deps.aimfoxWebhookLog,
        config: deps.config,
      },
      {
        batchSize: body.batchSize,
        syncConversations: body.syncConversations,
        maxLeads: body.maxLeads,
        ownerId: user?.id,
      },
    );

    return c.json({ result });
  });

  // POST /aimfox/cancel — cancel a running LinkedIn/AimFox backfill
  routes.post("/aimfox/cancel", async (c) => {
    const wasRunning = cancelAimfoxBackfill();
    if (wasRunning) {
      await deps.aimfoxSyncState.updateStatus("idle", "Import cancelled by user");
    } else {
      // Even if no backfill was running in-process, reset stuck state
      const state = await deps.aimfoxSyncState.get();
      if (state?.status === "syncing") {
        await deps.aimfoxSyncState.updateStatus("idle", "Import cancelled by user");
      }
    }
    return c.json({ success: true, wasRunning });
  });

  // POST /gmail/cancel — cancel/reset a stuck Gmail sync
  routes.post("/gmail/cancel", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    const user = await deps.users.findByEmail(userEmail);
    if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

    const state = await deps.gmailSyncState.findByUser(user.id);
    if (state?.status === "syncing") {
      await deps.gmailSyncState.updateStatus(user.id, "idle", "Import cancelled by user");
    }
    return c.json({ success: true });
  });

  // GET /aimfox/accounts — list LinkedIn accounts from AimFox
  routes.get("/aimfox/accounts", async (c) => {
    const userEmail = await getUserEmail(c, deps.config);
    if (!userEmail) return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);

    if (!deps.config.AIMFOX_API_KEY) {
      return c.json({ accounts: [] });
    }

    const { AimfoxClient } = await import("../lib/aimfox-client.js");
    const client = new AimfoxClient(deps.config.AIMFOX_API_KEY, deps.config.AIMFOX_ACCOUNT_ID);
    const accounts = await client.listAccounts();
    return c.json({ accounts });
  });

  return routes;
}
