import { Hono } from "hono";
import type { Config } from "../config.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createDedupCandidatesRepository } from "../db/repositories/dedup-candidates.js";
import type { createClassificationRunsRepository } from "../db/repositories/classification-runs.js";
import type { createClassificationLogsRepository } from "../db/repositories/classification-logs.js";
import { createBedrockClient } from "../lib/bedrock.js";
import { classifyContact } from "../lib/ai-classifier.js";
import { runTier3Dedup } from "../lib/ai-dedup.js";

interface ClassificationDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  linkedinMessages: ReturnType<typeof createLinkedinMessagesRepository>;
  dedupCandidates: ReturnType<typeof createDedupCandidatesRepository>;
  classificationRuns: ReturnType<typeof createClassificationRunsRepository>;
  classificationLogs: ReturnType<typeof createClassificationLogsRepository>;
  config: Config;
}

const MAX_EMAILS = 10;
const MAX_MESSAGES = 10;

// Module-level AbortController so the cancel endpoint can signal the running loop
let activeClassificationController: AbortController | null = null;

export function classificationRoutes(deps: ClassificationDeps) {
  const routes = new Hono();

  // POST /contacts — start async classification job
  routes.post("/contacts", async (c) => {
    const anthropic = createBedrockClient(deps.config);
    if (!anthropic) {
      return c.json(
        { error: { code: "CONFIG_ERROR", message: "AWS Bedrock credentials not configured" } },
        500,
      );
    }

    // Prevent concurrent runs
    const existingRun = await deps.classificationRuns.findRunning();
    if (existingRun) {
      return c.json({ runId: existingRun.id, message: "Classification already in progress" });
    }

    const unclassified = await deps.contacts.findUnclassified();
    if (unclassified.length === 0) {
      return c.json({ runId: null, message: "No contacts need classification" });
    }

    // Create run record
    const run = await deps.classificationRuns.create(unclassified.length);

    // Set up abort controller for cancellation
    activeClassificationController = new AbortController();
    const signal = activeClassificationController.signal;

    // Fire-and-forget the classification loop
    (async () => {
      try {
        console.log(`[classification] Starting run ${run.id} — ${unclassified.length} contacts`);

        for (let i = 0; i < unclassified.length; i++) {
          const contact = unclassified[i];
          // Check for cancellation at the start of each contact
          if (signal.aborted) {
            console.log(`[classification] Cancelled at contact ${i + 1}/${unclassified.length}`);
            break;
          }

          const contactLabel = `${contact.name} (${contact.email ?? "no email"})`;
          console.log(`[classification] [${i + 1}/${unclassified.length}] Processing: ${contactLabel}`);

          try {
            // Fetch company info
            let companyName: string | null = null;
            let companyDomain: string | null = null;
            if (contact.company_id) {
              const company = await deps.companies.findById(contact.company_id);
              if (company) {
                companyName = company.name;
                companyDomain = company.domain;
              }
            }

            // Fetch recent emails
            const recentEmails = await deps.emails.list({
              contactId: contact.id,
              limit: MAX_EMAILS,
            });

            const emailContext = recentEmails.map((e) => ({
              subject: e.subject ?? "(no subject)",
              snippet: (e.body ?? "").slice(0, 300),
              direction: e.direction,
              date: e.sent_at,
            }));

            // Fetch recent LinkedIn messages
            const recentMessages = await deps.linkedinMessages.list({
              contactId: contact.id,
              limit: MAX_MESSAGES,
            });

            const messageContext = recentMessages.map((m) => ({
              text: (m.message_text ?? "").slice(0, 300),
              direction: m.direction,
              date: m.sent_at,
            }));

            console.log(`[classification] [${i + 1}/${unclassified.length}] Calling Bedrock for: ${contactLabel} (${recentEmails.length} emails, ${recentMessages.length} messages)`);
            const bedrockStart = Date.now();

            // Classify with AI
            const result = await classifyContact(
              anthropic,
              {
                name: contact.name,
                email: contact.email,
                title: contact.title,
                companyName,
                companyDomain,
              },
              emailContext,
              messageContext,
              { signal },
            );

            const bedrockMs = Date.now() - bedrockStart;
            console.log(`[classification] [${i + 1}/${unclassified.length}] Bedrock responded in ${bedrockMs}ms → pipeline=${result.pipeline}, confidence=${result.confidence}`);

            const previousPipeline = contact.pipeline ?? "uncategorized";

            // Update contact (also clears needs_classification)
            await deps.contacts.updateClassification(contact.id, {
              aiSummary: result.summary || null,
              pipeline: result.pipeline !== "uncategorized" ? result.pipeline : null,
              aiConfidence: result.confidence || null,
            });

            // Update company pipeline if still uncategorized
            // Don't propagate "connected" to company — company keeps sales/client
            let pipelineChanged = false;
            if (
              contact.company_id &&
              result.pipeline !== "uncategorized" &&
              result.pipeline !== "connected" &&
              result.confidence !== "low"
            ) {
              const company = await deps.companies.findById(contact.company_id);
              if (company && company.pipeline === "uncategorized") {
                await deps.companies.update(contact.company_id, {
                  pipeline: result.pipeline,
                });
                pipelineChanged = true;
              }
            }

            // Write classification log
            await deps.classificationLogs.create({
              contactId: contact.id,
              runId: run.id,
              pipelineAssigned: result.pipeline,
              previousPipeline,
              aiSummary: result.summary,
              confidence: result.confidence,
            });

            await deps.classificationRuns.incrementProcessed(run.id, pipelineChanged);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[classification] [${i + 1}/${unclassified.length}] FAILED ${contactLabel}: ${errMsg}`);
            await deps.classificationRuns.incrementErrors(run.id);
            // Mark as classified to avoid retrying failures indefinitely
            await deps.contacts.updateClassification(contact.id, {
              aiSummary: null,
            });
          }
        }

        console.log(`[classification] All contacts processed for run ${run.id}`);

        // Skip dedup if cancelled
        if (!signal.aborted) {
          // Run Tier 3 dedup after classification
          console.log(`[classification] Starting Tier 3 dedup...`);
          try {
            await runTier3Dedup({
              contacts: deps.contacts,
              companies: deps.companies,
              dedupCandidates: deps.dedupCandidates,
              anthropic,
            });
          console.log(`[classification] Tier 3 dedup finished`);
          } catch (err) {
            console.error("[classification] Tier 3 dedup failed:", err);
          }
        } else {
          console.log(`[classification] Skipping dedup (cancelled)`);
        }

        // Only update status if it hasn't already been set by the cancel endpoint
        const currentRun = await deps.classificationRuns.findById(run.id);
        console.log(`[classification] Run ${run.id} current DB status: ${currentRun?.status}`);
        if (currentRun && currentRun.status === "running") {
          if (signal.aborted) {
            console.log(`[classification] Marking run ${run.id} as cancelled`);
            await deps.classificationRuns.cancel(run.id);
          } else {
            console.log(`[classification] Marking run ${run.id} as completed`);
            await deps.classificationRuns.complete(run.id);
          }
        } else {
          console.log(`[classification] Run ${run.id} already ${currentRun?.status} — skipping status update`);
        }
      } catch (err) {
        console.error("[classification] Run failed:", err);
        // Only mark as failed if not already cancelled
        const currentRun = await deps.classificationRuns.findById(run.id);
        if (currentRun && currentRun.status === "running") {
          await deps.classificationRuns.fail(run.id);
        }
      } finally {
        activeClassificationController = null;
      }
    })();

    // Return immediately
    return c.json({ runId: run.id });
  });

  // GET /runs — list all classification runs (most recent first)
  routes.get("/runs", async (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    const runs = await deps.classificationRuns.findAll(limit);

    return c.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        totalContacts: r.total_contacts,
        processedContacts: r.processed_contacts,
        pipelineChanges: r.pipeline_changes,
        errors: r.errors,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })),
    });
  });

  // GET /runs/latest — get most recent run (must be before :runId to avoid matching "latest" as UUID)
  routes.get("/runs/latest", async (c) => {
    const run = await deps.classificationRuns.findLatest();
    if (!run) {
      return c.json({ run: null, logs: [] });
    }

    const logs = await deps.classificationLogs.findByRunId(run.id);

    return c.json({
      run: {
        id: run.id,
        status: run.status,
        totalContacts: run.total_contacts,
        processedContacts: run.processed_contacts,
        pipelineChanges: run.pipeline_changes,
        errors: run.errors,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        contactName: l.contact_name,
        companyName: l.company_name,
        pipelineAssigned: l.pipeline_assigned,
        previousPipeline: l.previous_pipeline,
        aiSummary: l.ai_summary,
        confidence: l.confidence,
        createdAt: l.created_at,
      })),
    });
  });

  // GET /runs/:runId — get run status + logs
  routes.get("/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    const run = await deps.classificationRuns.findById(runId);
    if (!run) {
      return c.json({ error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
    }

    const logs = await deps.classificationLogs.findByRunId(runId);

    return c.json({
      run: {
        id: run.id,
        status: run.status,
        totalContacts: run.total_contacts,
        processedContacts: run.processed_contacts,
        pipelineChanges: run.pipeline_changes,
        errors: run.errors,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        contactName: l.contact_name,
        companyName: l.company_name,
        pipelineAssigned: l.pipeline_assigned,
        previousPipeline: l.previous_pipeline,
        aiSummary: l.ai_summary,
        confidence: l.confidence,
        createdAt: l.created_at,
      })),
    });
  });

  // GET /contacts/needs-classification/count
  routes.get("/contacts/needs-classification/count", async (c) => {
    const count = await deps.contacts.countNeedsClassification();
    return c.json({ count });
  });

  // GET /contacts/:contactId/classification-history
  routes.get("/contacts/:contactId/classification-history", async (c) => {
    const contactId = c.req.param("contactId");
    const logs = await deps.classificationLogs.findByContactId(contactId);
    return c.json({
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        pipelineAssigned: l.pipeline_assigned,
        previousPipeline: l.previous_pipeline,
        aiSummary: l.ai_summary,
        confidence: l.confidence,
        createdAt: l.created_at,
      })),
    });
  });

  // POST /cancel — stop an in-progress classification run
  routes.post("/cancel", async (c) => {
    if (activeClassificationController) {
      activeClassificationController.abort();
      activeClassificationController = null;

      // Also mark the run as cancelled in the DB immediately so the frontend picks it up
      // (the async loop will also try to mark it, but this ensures immediate feedback)
      const runningRun = await deps.classificationRuns.findRunning();
      if (runningRun) {
        await deps.classificationRuns.cancel(runningRun.id);
      }

      return c.json({ success: true, wasRunning: true });
    }
    return c.json({ success: true, wasRunning: false });
  });

  // POST /contact/:id — classify a single contact (unchanged, still synchronous)
  routes.post("/contact/:id", async (c) => {
    const anthropic = createBedrockClient(deps.config);
    if (!anthropic) {
      return c.json(
        { error: { code: "CONFIG_ERROR", message: "AWS Bedrock credentials not configured" } },
        500,
      );
    }

    const contact = await deps.contacts.findById(c.req.param("id"));
    if (!contact) {
      return c.json({ error: { code: "NOT_FOUND", message: "Contact not found" } }, 404);
    }

    let companyName: string | null = null;
    let companyDomain: string | null = null;
    if (contact.company_id) {
      const company = await deps.companies.findById(contact.company_id);
      if (company) {
        companyName = company.name;
        companyDomain = company.domain;
      }
    }

    const recentEmails = await deps.emails.list({
      contactId: contact.id,
      limit: MAX_EMAILS,
    });

    const emailContext = recentEmails.map((e) => ({
      subject: e.subject ?? "(no subject)",
      snippet: (e.body ?? "").slice(0, 300),
      direction: e.direction,
      date: e.sent_at,
    }));

    const recentMessages = await deps.linkedinMessages.list({
      contactId: contact.id,
      limit: MAX_MESSAGES,
    });

    const messageContext = recentMessages.map((m) => ({
      text: (m.message_text ?? "").slice(0, 300),
      direction: m.direction,
      date: m.sent_at,
    }));

    const result = await classifyContact(
      anthropic,
      {
        name: contact.name,
        email: contact.email,
        title: contact.title,
        companyName,
        companyDomain,
      },
      emailContext,
      messageContext,
    );

    await deps.contacts.updateClassification(contact.id, {
      aiSummary: result.summary || null,
      pipeline: result.pipeline !== "uncategorized" ? result.pipeline : null,
      aiConfidence: result.confidence || null,
    });

    if (
      contact.company_id &&
      result.pipeline !== "uncategorized" &&
      result.pipeline !== "connected" &&
      result.confidence !== "low"
    ) {
      const company = await deps.companies.findById(contact.company_id);
      if (company && company.pipeline === "uncategorized") {
        await deps.companies.update(contact.company_id, {
          pipeline: result.pipeline,
        });
      }
    }

    return c.json({ result });
  });

  return routes;
}
