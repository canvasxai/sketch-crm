/**
 * AI-powered action item generation using Claude Haiku via Bedrock.
 * Given a contact's recent activities and existing open tasks,
 * generates NEW action items that don't overlap with existing work.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { stripMarkdownFences } from "./dedup.js";

const MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const ACTION_PROMPT = `You are a CRM assistant. Given a contact's profile, their recent NEW activities (emails, LinkedIn messages, meetings), and their EXISTING open tasks, generate actionable follow-up tasks.

Rules:
1. Only generate tasks for NEW activities that require follow-up action from our team.
2. Do NOT generate tasks that semantically overlap with existing open tasks — check carefully.
3. Each task should be specific and actionable (e.g. "Send revised proposal to X" not "Follow up").
4. Set reasonable due dates relative to today. Urgent items within 2 days, standard within 7 days.
5. Only generate tasks where our team needs to take action. Skip informational emails, newsletters, automated notifications.
6. Maximum 5 tasks per batch.

Respond with ONLY a JSON array:
[{ "title": "...", "dueDate": "YYYY-MM-DD", "sourceType": "email"|"linkedin_message"|"meeting", "sourceId": "..." }]

If no new tasks are needed, return an empty array: []`;

interface ActivityContext {
  id: string;
  type: "email" | "linkedin_message" | "meeting";
  summary: string;
  date: string;
  direction?: string;
}

interface ExistingTask {
  title: string;
  dueDate: string | null;
  completed: boolean;
}

export interface GeneratedAction {
  title: string;
  dueDate: string;
  sourceType: string;
  sourceId: string;
}

export async function generateActions(
  anthropic: AnthropicBedrock,
  contact: {
    name: string;
    email: string | null;
    title: string | null;
    companyName: string | null;
    category: string;
  },
  activities: ActivityContext[],
  existingTasks: ExistingTask[],
  options?: { signal?: AbortSignal },
): Promise<GeneratedAction[]> {
  if (activities.length === 0) return [];

  const contactInfo = [
    `Name: ${contact.name}`,
    contact.email ? `Email: ${contact.email}` : null,
    contact.title ? `Title: ${contact.title}` : null,
    contact.companyName ? `Company: ${contact.companyName}` : null,
    `Category: ${contact.category}`,
  ]
    .filter(Boolean)
    .join("\n");

  const activityText = activities
    .map((a) => {
      const dir = a.direction ? `[${a.direction}] ` : "";
      return `[${a.type}] ${dir}${a.date} (id: ${a.id})\n${a.summary}`;
    })
    .join("\n\n");

  const tasksText =
    existingTasks.length > 0
      ? existingTasks
          .map(
            (t) =>
              `- ${t.title}${t.dueDate ? ` (due: ${t.dueDate})` : ""}`,
          )
          .join("\n")
      : "No existing open tasks.";

  const today = new Date().toISOString().split("T")[0];
  const userContent = `TODAY: ${today}\n\nCONTACT:\n${contactInfo}\n\nNEW ACTIVITIES (${activities.length}):\n${activityText}\n\nEXISTING OPEN TASKS:\n${tasksText}`;

  try {
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: userContent }],
        system: ACTION_PROMPT,
      },
      { timeout: 30_000, signal: options?.signal as AbortSignal | undefined },
    );

    let text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    text = stripMarkdownFences(text);

    const parsed = JSON.parse(text) as GeneratedAction[];

    if (!Array.isArray(parsed)) return [];

    // Validate and clean each action
    return parsed
      .filter(
        (a) =>
          a.title &&
          typeof a.title === "string" &&
          a.sourceType &&
          a.sourceId,
      )
      .slice(0, 5);
  } catch (err) {
    console.warn("[ai-action-generator] Generation failed:", err);
    return [];
  }
}
