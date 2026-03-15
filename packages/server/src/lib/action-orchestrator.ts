/**
 * Action generation orchestration — generates AI-driven tasks from new activities.
 */

import type { Config } from "../config.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createMeetingsRepository } from "../db/repositories/meetings.js";
import type { createTasksRepository } from "../db/repositories/tasks.js";
import type { createActionGenerationRunsRepository } from "../db/repositories/action-generation-runs.js";
import { createBedrockClient } from "./bedrock.js";
import { generateActions } from "./ai-action-generator.js";

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

let activeController: AbortController | null = null;

export function cancelActionGeneration(): boolean {
  if (activeController) {
    activeController.abort();
    activeController = null;
    return true;
  }
  return false;
}

async function processContact(
  contactId: string,
  deps: ActionDeps,
  runId: string | null,
  signal?: AbortSignal,
): Promise<number> {
  const contact = await deps.contacts.findById(contactId);
  if (!contact) return 0;

  // Gather unprocessed activities
  const [unprocessedEmails, unprocessedMessages, unprocessedMeetings] =
    await Promise.all([
      deps.emails.findUnprocessedActivities(contactId),
      deps.linkedinMessages.findUnprocessedActivities(contactId),
      deps.meetings.findUnprocessedActivities(contactId),
    ]);

  const totalUnprocessed =
    unprocessedEmails.length +
    unprocessedMessages.length +
    unprocessedMeetings.length;

  if (totalUnprocessed === 0) return 0;

  // Build activity context for AI
  const activities = [
    ...unprocessedEmails.map((e) => ({
      id: e.id,
      type: "email" as const,
      summary: `Subject: ${e.subject ?? "(no subject)"}\n${(e.body ?? "").slice(0, 300)}`,
      date: e.sent_at,
      direction: e.direction,
    })),
    ...unprocessedMessages.map((m) => ({
      id: m.id,
      type: "linkedin_message" as const,
      summary: (m.message_text ?? "").slice(0, 300),
      date: m.sent_at,
      direction: m.direction,
    })),
    ...unprocessedMeetings.map((m) => ({
      id: m.id,
      type: "meeting" as const,
      summary: `${m.title ?? "Meeting"}\n${(m.ai_summary ?? m.description ?? "").slice(0, 300)}`,
      date: m.start_time,
    })),
  ];

  // Get existing open tasks for dedup
  const existingTasks = await deps.tasks.listOpenByContact(contactId);
  const existingTaskContext = existingTasks.map((t) => ({
    title: t.title,
    dueDate: t.due_date,
    completed: t.completed,
  }));

  // Get company info
  let companyName: string | null = null;
  if (contact.company_id) {
    const company = await deps.companies.findById(contact.company_id);
    companyName = company?.name ?? null;
  }

  // Call AI
  const anthropic = createBedrockClient(deps.config);
  if (!anthropic) return 0;

  const generated = await generateActions(
    anthropic,
    {
      name: contact.name,
      email: contact.email,
      title: contact.title,
      companyName,
      category: contact.category,
    },
    activities,
    existingTaskContext,
    { signal },
  );

  // Insert generated tasks
  for (const action of generated) {
    await deps.tasks.create({
      contactId,
      companyId: contact.company_id ?? undefined,
      title: action.title,
      dueDate: action.dueDate,
      origin: "crm_ai",
      sourceType: action.sourceType,
      sourceId: action.sourceId,
      generationRunId: runId ?? undefined,
    });
  }

  // Mark all activities as processed
  await Promise.all([
    deps.emails.markActionProcessed(unprocessedEmails.map((e) => e.id)),
    deps.linkedinMessages.markActionProcessed(
      unprocessedMessages.map((m) => m.id),
    ),
    deps.meetings.markActionProcessed(unprocessedMeetings.map((m) => m.id)),
  ]);

  return generated.length;
}

export async function generateActionsForSingleContact(
  contactId: string,
  deps: ActionDeps,
): Promise<{ tasksCreated: number }> {
  const tasksCreated = await processContact(contactId, deps, null);
  return { tasksCreated };
}

export async function generateActionsForAllLeads(
  deps: ActionDeps,
): Promise<string> {
  // Prevent concurrent runs
  const existingRun = await deps.actionRuns.findRunning();
  if (existingRun) {
    return existingRun.id;
  }

  // Find eligible contacts: category IN (sales, client) OR is_decision_maker
  const candidates = await deps.contacts.findActionCandidates();
  if (candidates.length === 0) {
    throw new Error("No eligible contacts found");
  }

  const run = await deps.actionRuns.create(candidates.length);

  activeController = new AbortController();
  const signal = activeController.signal;

  // Fire-and-forget
  (async () => {
    try {
      console.log(
        `[action-generator] Starting run ${run.id} — ${candidates.length} contacts`,
      );

      for (let i = 0; i < candidates.length; i++) {
        if (signal.aborted) {
          console.log(
            `[action-generator] Cancelled at contact ${i + 1}/${candidates.length}`,
          );
          break;
        }

        const contact = candidates[i];
        console.log(
          `[action-generator] [${i + 1}/${candidates.length}] Processing: ${contact.name}`,
        );

        try {
          const tasksCreated = await processContact(
            contact.id,
            deps,
            run.id,
            signal,
          );
          await deps.actionRuns.incrementProcessed(run.id, tasksCreated);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `[action-generator] [${i + 1}/${candidates.length}] FAILED ${contact.name}: ${errMsg}`,
          );
          await deps.actionRuns.incrementErrors(run.id);
        }
      }

      const currentRun = await deps.actionRuns.findById(run.id);
      if (currentRun && currentRun.status === "running") {
        if (signal.aborted) {
          await deps.actionRuns.cancel(run.id);
        } else {
          await deps.actionRuns.complete(run.id);
        }
      }
    } catch (err) {
      console.error("[action-generator] Run failed:", err);
      const currentRun = await deps.actionRuns.findById(run.id);
      if (currentRun && currentRun.status === "running") {
        await deps.actionRuns.fail(run.id);
      }
    } finally {
      activeController = null;
    }
  })();

  return run.id;
}
