/**
 * AI-powered contact classification using Claude Haiku via Bedrock.
 * Classifies contacts into pipelines and generates context summaries.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { stripMarkdownFences } from "./dedup.js";

const MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const CLASSIFICATION_PROMPT = `You are a CRM assistant for a B2B services/SaaS company. Given a contact's information and their recent communication history, classify them into one of these categories:

- "sales" — Active sales prospect or contact at a company we are selling to. Includes warm leads, demo requests, pricing discussions, and other team members at prospect companies.
- "client" — Existing customer/client or contact at a company using our services/products. Includes primary relationship contacts, support, account management, and other team members at client companies.
- "hiring" — Job candidate or hiring-related contact. Someone applying for a role, being recruited, or involved in hiring discussions.
- "muted" — Irrelevant contact. Newsletters, automated emails, vendors trying to sell to US, spam, cold outreach from others, transactional notifications.
- "contractors" — Vendor, service provider, or contractor providing services TO our company. Includes accountants, banks, lawyers, designers, freelancers, IT providers, consultants.
- "investors" — Investor, VC, angel, or fundraising-related contact. Includes venture capitalists, angel investors, fund managers, and contacts involved in fundraising or investment discussions.
- "uncategorized" — Not enough information to classify. Only use this if there is truly insufficient signal.

Also determine if this person is a **decision maker** — the primary relationship driver at their company. Decision makers are the main business contacts driving deals or owning the client relationship (e.g., buyers, account owners, executives with purchasing authority). Non-decision-makers are developers, operations, finance, legal, IT, or other team members who are relevant but not the primary contact.

Also generate a brief summary (1-2 sentences) describing the relationship context.

Respond with ONLY a JSON object:
{ "category": "sales"|"client"|"hiring"|"muted"|"contractors"|"investors"|"uncategorized", "isDecisionMaker": true|false, "summary": "<1-2 sentence context>", "confidence": "high"|"medium"|"low" }`;

interface EmailContext {
  subject: string;
  snippet: string;
  direction: string;
  date: string;
}

interface MessageContext {
  text: string;
  direction: string;
  date: string;
}

interface MeetingSummaryContext {
  title: string;
  summary: string;
  date: string;
}

export interface ClassificationResult {
  category: string;
  isDecisionMaker: boolean;
  summary: string;
  confidence: string;
}

export async function classifyContact(
  anthropic: AnthropicBedrock,
  contact: {
    name: string;
    email: string | null;
    title: string | null;
    companyName: string | null;
    companyDomain: string | null;
  },
  emails: EmailContext[],
  messages: MessageContext[],
  options?: { signal?: AbortSignal; meetingSummaries?: MeetingSummaryContext[] },
): Promise<ClassificationResult> {
  const contactInfo = [
    `Name: ${contact.name}`,
    contact.email ? `Email: ${contact.email}` : null,
    contact.title ? `Title: ${contact.title}` : null,
    contact.companyName ? `Company: ${contact.companyName}` : null,
    contact.companyDomain ? `Domain: ${contact.companyDomain}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const emailHistory =
    emails.length > 0
      ? emails
          .map(
            (e) =>
              `[${e.direction}] ${e.date} — ${e.subject}\n${e.snippet}`,
          )
          .join("\n\n")
      : "No email history.";

  const messageHistory =
    messages.length > 0
      ? messages
          .map((m) => `[${m.direction}] ${m.date} — ${m.text}`)
          .join("\n\n")
      : "No LinkedIn message history.";

  const meetingSummaries = options?.meetingSummaries ?? [];
  const meetingHistory =
    meetingSummaries.length > 0
      ? meetingSummaries
          .map((m) => `${m.date} — ${m.title}\n${m.summary}`)
          .join("\n\n")
      : "No meeting transcripts.";

  const userContent = `CONTACT:\n${contactInfo}\n\nRECENT EMAILS (last ${emails.length}):\n${emailHistory}\n\nRECENT LINKEDIN MESSAGES (last ${messages.length}):\n${messageHistory}\n\nRECENT MEETING SUMMARIES (last ${meetingSummaries.length}):\n${meetingHistory}`;

  try {
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: userContent }],
        system: CLASSIFICATION_PROMPT,
      },
      { timeout: 30_000, signal: options?.signal as AbortSignal | undefined },
    );

    let text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    // Strip markdown code fences if the model wraps its response
    text = stripMarkdownFences(text);

    const parsed = JSON.parse(text) as ClassificationResult;

    // Validate category value (also accept legacy "pipeline" key from AI)
    if (!parsed.category && (parsed as any).pipeline) {
      parsed.category = (parsed as any).pipeline;
    }
    const validCategories = [
      "sales",
      "client",
      "hiring",
      "muted",
      "contractors",
      "investors",
      "uncategorized",
    ];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = "uncategorized";
    }

    // Ensure isDecisionMaker is a boolean
    parsed.isDecisionMaker = parsed.isDecisionMaker === true;

    return parsed;
  } catch (err) {
    console.warn("[ai-classifier] Classification failed:", err);
    return {
      category: "uncategorized",
      isDecisionMaker: false,
      summary: "",
      confidence: "low",
    };
  }
}
