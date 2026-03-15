import { Hono } from "hono";
import type { Config } from "../config.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createMeetingsRepository } from "../db/repositories/meetings.js";
import type { createTasksRepository } from "../db/repositories/tasks.js";
import type { createActionGenerationRunsRepository } from "../db/repositories/action-generation-runs.js";
import {
  generateActionsForAllLeads,
  generateActionsForSingleContact,
  cancelActionGeneration,
} from "../lib/action-orchestrator.js";

interface ActionDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  linkedinMessages: ReturnType<typeof createLinkedinMessagesRepository>;
  meetings: ReturnType<typeof createMeetingsRepository>;
  tasks: ReturnType<typeof createTasksRepository>;
  actionRuns: ReturnType<typeof createActionGenerationRunsRepository>;
  config: Config;
}

export function actionsRoutes(deps: ActionDeps) {
  const routes = new Hono();

  // GET /pending — count contacts in sales pipeline with unprocessed activities
  routes.get("/pending", async (c) => {
    const candidates = await deps.contacts.findActionCandidates();
    let contactsWithActivity = 0;

    for (const contact of candidates) {
      const [emails, messages, meetings] = await Promise.all([
        deps.emails.findUnprocessedActivities(contact.id),
        deps.linkedinMessages.findUnprocessedActivities(contact.id),
        deps.meetings.findUnprocessedActivities(contact.id),
      ]);
      if (emails.length > 0 || messages.length > 0 || meetings.length > 0) {
        contactsWithActivity++;
      }
    }

    return c.json({ count: contactsWithActivity, totalCandidates: candidates.length });
  });

  // POST /generate — bulk action generation (fire-and-forget)
  routes.post("/generate", async (c) => {
    try {
      const runId = await generateActionsForAllLeads(deps);
      return c.json({ runId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: "GENERATION_ERROR", message: msg } }, 500);
    }
  });

  // POST /generate/:contactId — single contact action generation
  routes.post("/generate/:contactId", async (c) => {
    const contactId = c.req.param("contactId");
    const contact = await deps.contacts.findById(contactId);
    if (!contact) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Contact not found" } },
        404,
      );
    }

    const result = await generateActionsForSingleContact(contactId, deps);
    return c.json({ result });
  });

  // GET /runs — list all action generation runs
  routes.get("/runs", async (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    const runs = await deps.actionRuns.findAll(limit);

    return c.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        totalContacts: r.total_contacts,
        processedContacts: r.processed_contacts,
        tasksCreated: r.tasks_created,
        errors: r.errors,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })),
    });
  });

  // GET /runs/latest — most recent run
  routes.get("/runs/latest", async (c) => {
    const run = await deps.actionRuns.findLatest();
    if (!run) {
      return c.json({ run: null });
    }

    return c.json({
      run: {
        id: run.id,
        status: run.status,
        totalContacts: run.total_contacts,
        processedContacts: run.processed_contacts,
        tasksCreated: run.tasks_created,
        errors: run.errors,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
    });
  });

  // GET /runs/:runId — specific run
  routes.get("/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    const run = await deps.actionRuns.findById(runId);
    if (!run) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Run not found" } },
        404,
      );
    }

    return c.json({
      run: {
        id: run.id,
        status: run.status,
        totalContacts: run.total_contacts,
        processedContacts: run.processed_contacts,
        tasksCreated: run.tasks_created,
        errors: run.errors,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
    });
  });

  // POST /cancel — stop in-progress action generation
  routes.post("/cancel", async (c) => {
    const wasRunning = cancelActionGeneration();

    if (wasRunning) {
      const runningRun = await deps.actionRuns.findRunning();
      if (runningRun) {
        await deps.actionRuns.cancel(runningRun.id);
      }
    }

    return c.json({ success: true, wasRunning });
  });

  // GET /cron — daily cron trigger
  routes.get("/cron", async (c) => {
    const cronSecret = deps.config.CRON_SECRET;
    if (cronSecret) {
      const authHeader = c.req.header("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return c.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } },
          401,
        );
      }
    }

    try {
      const runId = await generateActionsForAllLeads(deps);
      return c.json({ runId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: "GENERATION_ERROR", message: msg } }, 500);
    }
  });

  return routes;
}
