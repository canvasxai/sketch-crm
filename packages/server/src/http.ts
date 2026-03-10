/**
 * HTTP app factory — API routes, auth middleware, static file serving.
 * Route registration order: API routes → static assets → SPA catch-all.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { Kysely } from "kysely";
import { authRoutes } from "./api/auth.js";
import { classificationRoutes } from "./api/classification.js";
import { companiesRoutes } from "./api/companies.js";
import { contactsRoutes } from "./api/contacts.js";
import { emailsRoutes } from "./api/emails.js";
import { healthRoutes } from "./api/health.js";
import { ingestionRoutes } from "./api/ingestion.js";
import { insightsRoutes } from "./api/insights.js";
import { integrationsRoutes } from "./api/integrations.js";
import { linkedinMessagesRoutes } from "./api/linkedin-messages.js";
import { meetingsRoutes } from "./api/meetings.js";
import { authMiddleware } from "./api/middleware.js";
import { notesRoutes } from "./api/notes.js";
import { settingsRoutes } from "./api/settings.js";
import { tasksRoutes } from "./api/tasks.js";
import { timelineRoutes } from "./api/timeline.js";
import { usersRoutes } from "./api/users.js";
import type { Config } from "./config.js";
import { createCalendarSyncStateRepository } from "./db/repositories/calendar-sync-state.js";
import { createCompaniesRepository } from "./db/repositories/companies.js";
import { createContactsRepository } from "./db/repositories/contacts.js";
import { createEmailsRepository } from "./db/repositories/emails.js";
import { createGmailSyncStateRepository } from "./db/repositories/gmail-sync-state.js";
import { createLinkedinMessagesRepository } from "./db/repositories/linkedin-messages.js";
import { createMeetingsRepository } from "./db/repositories/meetings.js";
import { createNotesRepository } from "./db/repositories/notes.js";
import { createOrgSettingsRepository } from "./db/repositories/org-settings.js";
import { createStageChangesRepository } from "./db/repositories/stage-changes.js";
import { createTasksRepository } from "./db/repositories/tasks.js";
import { createUsersRepository } from "./db/repositories/users.js";
import { createVendorDomainsRepository } from "./db/repositories/vendor-domains.js";
import { createDedupLogRepository } from "./db/repositories/dedup-log.js";
import { createAimfoxSyncStateRepository } from "./db/repositories/aimfox-sync-state.js";
import { createAimfoxWebhookLogRepository } from "./db/repositories/aimfox-webhook-log.js";
import type { DB } from "./db/schema.js";
import { webhookRoutes } from "./api/webhooks.js";

export function createApp(db: Kysely<DB>, config: Config) {
  const app = new Hono();

  // Create repositories
  const users = createUsersRepository(db);
  const companies = createCompaniesRepository(db);
  const contacts = createContactsRepository(db);
  const emails = createEmailsRepository(db);
  const linkedinMessages = createLinkedinMessagesRepository(db);
  const meetings = createMeetingsRepository(db);
  const notes = createNotesRepository(db);
  const tasks = createTasksRepository(db);
  const stageChanges = createStageChangesRepository(db);
  const gmailSyncState = createGmailSyncStateRepository(db);
  const calendarSyncState = createCalendarSyncStateRepository(db);
  const orgSettings = createOrgSettingsRepository(db);
  const vendorDomains = createVendorDomainsRepository(db);
  const dedupLog = createDedupLogRepository(db);
  const aimfoxSyncState = createAimfoxSyncStateRepository(db);
  const aimfoxWebhookLog = createAimfoxWebhookLogRepository(db);

  // Webhook routes — mounted BEFORE auth middleware (not under /api/*)
  app.route("/webhooks", webhookRoutes({
    contacts,
    companies,
    linkedinMessages,
    aimfoxSyncState,
    aimfoxWebhookLog,
    config,
  }));

  // Auth middleware on all /api/* routes
  app.use("/api/*", authMiddleware(config));

  // API routes
  app.route("/api/health", healthRoutes(db));
  app.route("/api/auth", authRoutes(users, config));
  app.route("/api/users", usersRoutes(users));
  app.route("/api/companies", companiesRoutes(companies));
  app.route("/api/contacts", contactsRoutes(contacts, companies, users, stageChanges, config, dedupLog));
  app.route("/api/emails", emailsRoutes(emails));
  app.route("/api/linkedin-messages", linkedinMessagesRoutes(linkedinMessages, { contacts, config }));
  app.route("/api/meetings", meetingsRoutes(meetings));
  app.route("/api/notes", notesRoutes(notes));
  app.route("/api/tasks", tasksRoutes(tasks));
  app.route("/api/settings", settingsRoutes(orgSettings, vendorDomains, contacts, companies));
  app.route("/api/insights", insightsRoutes(db));
  app.route("/api/timeline", timelineRoutes({ emails, linkedinMessages, meetings, notes, tasks, stageChanges, contacts }));
  app.route("/api/ingestion", ingestionRoutes({ contacts, companies, linkedinMessages }));
  app.route(
    "/api/integrations",
    integrationsRoutes({
      users,
      contacts,
      companies,
      emails,
      linkedinMessages,
      gmailSyncState,
      calendarSyncState,
      orgSettings,
      vendorDomains,
      dedupLog,
      aimfoxSyncState,
      aimfoxWebhookLog,
      config,
    }),
  );
  app.route("/api/classify", classificationRoutes({ contacts, emails, config }));

  // Static file serving for the SPA (production only — dev uses Vite dev server)
  const webDistDir = resolve(import.meta.dirname, "../../web/dist");

  if (existsSync(webDistDir)) {
    app.use("/assets/*", serveStatic({ root: webDistDir }));

    const indexHtml = readFileSync(join(webDistDir, "index.html"), "utf-8");
    app.get("*", (c) => {
      if (c.req.path.startsWith("/api/")) {
        return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
      }
      return c.html(indexHtml);
    });
  }

  return app;
}
