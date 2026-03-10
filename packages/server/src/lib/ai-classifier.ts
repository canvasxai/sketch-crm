/**
 * AI-powered contact classification using Claude Haiku.
 * Classifies contacts into funnel stages based on their email history.
 */

import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { FUNNEL_STAGES } from "@crm/shared";

const CLASSIFICATION_PROMPT = `You are a sales CRM assistant. Given a contact's email history, classify them into exactly one funnel stage.

Funnel stages:
- "new": No meaningful engagement yet, or just initial outreach
- "qualified": Has shown interest, responded to outreach, or had initial conversations
- "opportunity": Active deal discussion, pricing/proposal stage, demo requests
- "customer": Has purchased/signed, is an active paying customer
- "dormant": Was previously engaged but has gone silent (no response in 30+ days)
- "lost": Explicitly declined, chose competitor, or deal fell through

Rules:
- Base your classification on the CONTENT and RECENCY of emails
- If the most recent email is a decline or "no thanks", classify as "lost"
- If there's been no response to the last 2+ outreach emails, classify as "dormant"
- Look for buying signals: pricing questions, timeline discussions, decision-maker involvement → "opportunity"
- Look for closing signals: contract discussions, onboarding, payment → "customer"

Respond with ONLY the stage name, nothing else. One of: new, qualified, opportunity, customer, dormant, lost`;

interface EmailSummary {
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  direction: string;
}

export async function classifyContact(
  anthropic: AnthropicBedrock,
  contactName: string,
  contactEmail: string,
  emails: EmailSummary[],
): Promise<string> {
  const emailThread = emails
    .slice(0, 20)
    .map((e) => {
      const body = (e.body || "").slice(0, 500);
      return `[${e.date}] ${e.direction.toUpperCase()}: ${e.subject}\nFrom: ${e.from}\nTo: ${e.to}\n${body}`;
    })
    .join("\n---\n");

  const response = await anthropic.messages.create({
    model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: `Contact: ${contactName} (${contactEmail})\n\nEmail history (most recent first):\n${emailThread}`,
      },
    ],
    system: CLASSIFICATION_PROMPT,
  });

  const text =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim().toLowerCase()
      : "new";

  if ((FUNNEL_STAGES as readonly string[]).includes(text)) {
    return text;
  }
  return "new";
}
