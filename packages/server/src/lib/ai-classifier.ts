/**
 * AI-powered contact classification using Claude Haiku via Bedrock.
 * Classifies contacts into pipelines and generates context summaries.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

const MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const CLASSIFICATION_PROMPT = `You are a CRM assistant for a B2B services/SaaS company. Given a contact's information and their recent communication history, classify them into one of these pipelines:

- "sales" — Active sales prospect. Someone we are selling to or trying to sell to. Includes warm leads, demo requests, pricing discussions, proposal conversations. This is the primary business contact driving the deal.
- "client" — Existing customer or client. Someone who has already purchased or is using our services/products. Includes support conversations, account management, renewals. This is the primary relationship contact.
- "connected" — A contact at a company we're already engaging with who isn't the primary relationship driver. Developers, operations, finance, legal, IT, or other team members at a sales prospect or client company. They are relevant but not the main sales/client contact.
- "hiring" — Job candidate or hiring-related contact. Someone applying for a role, being recruited, or involved in hiring discussions.
- "muted" — Irrelevant contact. Newsletters, automated emails, vendors trying to sell to US, spam, cold outreach from others, transactional notifications.
- "uncategorized" — Not enough information to classify. Only use this if there is truly insufficient signal.

Also generate a brief summary (1-2 sentences) describing the relationship context. For sales/client contacts, focus on what's being discussed, deal stage, or product interest. For connected contacts, describe their role and how they relate to the primary engagement. For hiring contacts, mention the role. For muted contacts, explain why they're irrelevant. For uncategorized, say what little is known.

Respond with ONLY a JSON object:
{ "pipeline": "sales"|"client"|"connected"|"hiring"|"muted"|"uncategorized", "summary": "<1-2 sentence context>", "confidence": "high"|"medium"|"low" }`;

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

export interface ClassificationResult {
  pipeline: string;
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
  options?: { signal?: AbortSignal },
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

  const userContent = `CONTACT:\n${contactInfo}\n\nRECENT EMAILS (last ${emails.length}):\n${emailHistory}\n\nRECENT LINKEDIN MESSAGES (last ${messages.length}):\n${messageHistory}`;

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

    // Strip markdown code fences if the model wraps its response in ```json ... ```
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    const parsed = JSON.parse(text) as ClassificationResult;

    // Validate pipeline value
    const validPipelines = [
      "sales",
      "client",
      "connected",
      "hiring",
      "muted",
      "uncategorized",
    ];
    if (!validPipelines.includes(parsed.pipeline)) {
      parsed.pipeline = "uncategorized";
    }

    return parsed;
  } catch (err) {
    console.warn("[ai-classifier] Classification failed:", err);
    return {
      pipeline: "uncategorized",
      summary: "",
      confidence: "low",
    };
  }
}
