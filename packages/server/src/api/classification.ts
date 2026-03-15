import { Hono } from "hono";
import type { Config } from "../config.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createMeetingsRepository } from "../db/repositories/meetings.js";
import type { createDedupCandidatesRepository } from "../db/repositories/dedup-candidates.js";
import type { createClassificationRunsRepository } from "../db/repositories/classification-runs.js";
import type { createClassificationLogsRepository } from "../db/repositories/classification-logs.js";
import { createBedrockClient } from "../lib/bedrock.js";
import { createCanvasClient } from "../lib/canvas-client.js";
import { classifyContact } from "../lib/ai-classifier.js";
import { runTier3Dedup } from "../lib/ai-dedup.js";
import { crossSourceDbMatch, enrichContactLinkedin, shouldEnrichForCategory } from "../lib/cross-source-dedup.js";
import { mergeContacts } from "./contacts.js";
import { mapRow } from "../lib/map-row.js";

interface ClassificationDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  linkedinMessages: ReturnType<typeof createLinkedinMessagesRepository>;
  meetings: ReturnType<typeof createMeetingsRepository>;
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

        // Company category cache — avoids redundant AI calls for contacts at already-categorized companies
        const companyCategoryCache = new Map<string, string>();

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
            // Fetch company info + check if company already categorized
            let companyName: string | null = null;
            let companyDomain: string | null = null;
            if (contact.company_id) {
              // Check cache first — skip AI if company already categorized
              let knownCategory = companyCategoryCache.get(contact.company_id);

              if (!knownCategory) {
                const company = await deps.companies.findById(contact.company_id);
                if (company) {
                  companyName = company.name;
                  companyDomain = company.domain;
                  if (company.category && company.category !== "uncategorized") {
                    knownCategory = company.category;
                    companyCategoryCache.set(contact.company_id, knownCategory);
                  }
                }
              }

              if (knownCategory) {
                // Inherit company category — skip AI call
                const previousCategory = contact.category ?? "uncategorized";
                await deps.contacts.updateClassification(contact.id, {
                  category: knownCategory,
                });
                await deps.classificationLogs.create({
                  contactId: contact.id,
                  runId: run.id,
                  categoryAssigned: knownCategory,
                  previousCategory,
                  aiSummary: null,
                  confidence: "inherited",
                });
                await deps.classificationRuns.incrementProcessed(run.id, knownCategory !== previousCategory);
                console.log(`[classification] [${i + 1}/${unclassified.length}] Skipping AI — company already categorized as "${knownCategory}": ${contactLabel}`);
                continue;
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

            // Fetch recent meetings with AI summaries
            const recentMeetings = await deps.meetings.list({
              contactId: contact.id,
              limit: 5,
            });

            const meetingSummaries = recentMeetings
              .filter((m) => m.ai_summary)
              .map((m) => ({
                title: m.title ?? "Meeting",
                summary: m.ai_summary!,
                date: m.start_time,
              }));

            // Skip LinkedIn-only contacts with no communication history — AI has nothing to classify
            // Just clear the flag without setting ai_classified_at (avoids review queue)
            if (contact.source === "linkedin" && recentEmails.length === 0 && recentMessages.length === 0 && meetingSummaries.length === 0) {
              await deps.contacts.clearNeedsClassification([contact.id]);
              await deps.classificationLogs.create({
                contactId: contact.id,
                runId: run.id,
                categoryAssigned: "uncategorized",
                previousCategory: contact.category ?? "uncategorized",
                aiSummary: null,
                confidence: "skipped",
              });
              await deps.classificationRuns.incrementProcessed(run.id, false);
              console.log(`[classification] [${i + 1}/${unclassified.length}] Skipping AI — LinkedIn contact with no messages: ${contactLabel}`);
              continue;
            }

            console.log(`[classification] [${i + 1}/${unclassified.length}] Calling Bedrock for: ${contactLabel} (${recentEmails.length} emails, ${recentMessages.length} messages, ${meetingSummaries.length} meetings)`);
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
              { signal, meetingSummaries },
            );

            const bedrockMs = Date.now() - bedrockStart;
            console.log(`[classification] [${i + 1}/${unclassified.length}] Bedrock responded in ${bedrockMs}ms → category=${result.category}, confidence=${result.confidence}`);

            const previousCategory = contact.category ?? "uncategorized";

            // Update contact (also clears needs_classification)
            await deps.contacts.updateClassification(contact.id, {
              aiSummary: result.summary || null,
              category: result.category,
              aiConfidence: result.confidence || null,
              isDecisionMaker: result.isDecisionMaker,
            });

            // Always sync category to company + all sibling contacts
            let categoryChanged = false;
            if (
              contact.company_id &&
              result.category !== "uncategorized" &&
              result.confidence !== "low"
            ) {
              await deps.companies.update(contact.company_id, {
                category: result.category,
              });
              await deps.contacts.updateCategoryByCompanyId(contact.company_id, result.category);
              categoryChanged = true;
              // Cache for subsequent contacts at this company
              companyCategoryCache.set(contact.company_id, result.category);
            }

            // Write classification log
            await deps.classificationLogs.create({
              contactId: contact.id,
              runId: run.id,
              categoryAssigned: result.category,
              previousCategory,
              aiSummary: result.summary,
              confidence: result.confidence,
            });

            await deps.classificationRuns.incrementProcessed(run.id, categoryChanged);

            // Trigger Pass 2 LinkedIn enrichment for high-value contacts (fire-and-forget)
            if (shouldEnrichForCategory(result.category) && !contact.linkedin_url) {
              const canvasClient = createCanvasClient(deps.config);
              if (canvasClient && anthropic) {
                enrichContactLinkedin(contact.id, {
                  contacts: deps.contacts,
                  companies: deps.companies,
                  dedupCandidates: deps.dedupCandidates,
                  canvas: canvasClient,
                  anthropic,
                  autoMerge: (keepId, mergeId) => mergeContacts(keepId, mergeId, {
                    contacts: deps.contacts,
                    emails: deps.emails,
                    linkedinMessages: deps.linkedinMessages,
                    dedupCandidates: deps.dedupCandidates,
                  }),
                }).catch((err) => {
                  console.error(`[classification] LinkedIn enrichment failed for ${contactLabel}:`, err);
                });
              }
            }
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

          // Run cross-source dedup Pass 1 (DB-only batch matching, free)
          if (!signal.aborted) {
            console.log(`[classification] Starting cross-source dedup (Pass 1: DB match)...`);
            try {
              await crossSourceDbMatch({
                contacts: deps.contacts,
                companies: deps.companies,
                dedupCandidates: deps.dedupCandidates,
              });
              console.log(`[classification] Cross-source dedup (Pass 1) finished`);
            } catch (err) {
              console.error("[classification] Cross-source dedup (Pass 1) failed:", err);
            }
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
        categoryChanges: r.category_changes,
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
        categoryChanges: run.category_changes,
        errors: run.errors,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        contactName: l.contact_name,
        companyName: l.company_name,
        categoryAssigned: l.category_assigned,
        previousCategory: l.previous_category,
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
        categoryChanges: run.category_changes,
        errors: run.errors,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        contactName: l.contact_name,
        companyName: l.company_name,
        categoryAssigned: l.category_assigned,
        previousCategory: l.previous_category,
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
        categoryAssigned: l.category_assigned,
        previousCategory: l.previous_category,
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

    // Fetch recent meetings with AI summaries
    const recentMeetings = await deps.meetings.list({
      contactId: contact.id,
      limit: 5,
    });

    const meetingSummaries = recentMeetings
      .filter((m) => m.ai_summary)
      .map((m) => ({
        title: m.title ?? "Meeting",
        summary: m.ai_summary!,
        date: m.start_time,
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
      { meetingSummaries },
    );

    await deps.contacts.updateClassification(contact.id, {
      aiSummary: result.summary || null,
      category: result.category,
      aiConfidence: result.confidence || null,
      isDecisionMaker: result.isDecisionMaker,
    });

    // Always sync category to company + all sibling contacts
    if (
      contact.company_id &&
      result.category !== "uncategorized" &&
      result.confidence !== "low"
    ) {
      await deps.companies.update(contact.company_id, {
        category: result.category,
      });
      await deps.contacts.updateCategoryByCompanyId(contact.company_id, result.category);
    }

    return c.json({ result });
  });

  // ── Review queue endpoints ──

  // GET /contacts/needs-review
  routes.get("/contacts/needs-review", async (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    const rows = await deps.contacts.findNeedsReview(limit, offset);
    return c.json({
      contacts: rows.map((r) => ({
        ...mapRow(r),
        companyName: r.company_name,
      })),
    });
  });

  // GET /contacts/needs-review/count
  routes.get("/contacts/needs-review/count", async (c) => {
    const count = await deps.contacts.countNeedsReview();
    return c.json({ count });
  });

  // POST /contacts/:id/confirm-classification
  routes.post("/contacts/:id/confirm-classification", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ category: string }>();
    if (!body.category) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "category is required" } }, 400);
    }
    const updated = await deps.contacts.confirmClassification(id, body.category);

    // Auto-sync category to company + all sibling contacts
    if (updated.company_id) {
      await deps.companies.update(updated.company_id, { category: body.category });
      await deps.contacts.updateCategoryByCompanyId(updated.company_id, body.category);
    }

    return c.json({ contact: mapRow(updated) });
  });

  return routes;
}
