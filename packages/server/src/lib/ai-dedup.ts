/**
 * AI-powered contact deduplication and personal email classification.
 * Uses Claude Haiku via Bedrock for cost-effective inference.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

const MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// ── Name dedup ──

const DEDUP_PROMPT = `You are a CRM deduplication assistant. Given a NEW contact (name + email) and a list of EXISTING contacts, determine if the new contact is the same person as any existing contact.

Consider:
- Name similarity (first/last name matching, nicknames, abbreviations)
- Email domain consistency
- Common name variations (Robert/Bob, William/Bill, etc.)

Respond with ONLY a JSON object:
{ "match": true/false, "matchedIndex": <0-based index or null>, "confidence": "high"/"medium"/"low", "reason": "<brief explanation>" }

If no match, respond: { "match": false, "matchedIndex": null, "confidence": "high", "reason": "no match" }`;

export interface DedupCandidate {
  name: string;
  email: string | null;
  id: string;
}

export interface DedupResult {
  match: boolean;
  matchedIndex: number | null;
  confidence: string;
  reason: string;
}

export async function checkNameDedup(
  anthropic: AnthropicBedrock,
  newName: string,
  newEmail: string,
  candidates: DedupCandidate[],
): Promise<DedupResult> {
  if (candidates.length === 0) {
    return { match: false, matchedIndex: null, confidence: "high", reason: "no candidates" };
  }

  const candidateList = candidates
    .map((c, i) => `  ${i}: ${c.name} (${c.email ?? "no email"})`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `NEW contact: ${newName} (${newEmail})\n\nEXISTING contacts:\n${candidateList}`,
      },
    ],
    system: DEDUP_PROMPT,
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  try {
    return JSON.parse(text) as DedupResult;
  } catch {
    return { match: false, matchedIndex: null, confidence: "low", reason: "parse error" };
  }
}

// ── Personal email classification ──

const PERSONAL_EMAIL_CLASSIFICATION_PROMPT = `You are a CRM assistant. Given an email from a personal email domain (gmail, yahoo, hotmail, etc.), analyze the email content and determine:
1. Is this person likely a business prospect (vs personal/spam)?
2. Can you identify what company they work for from the email content?

Respond with ONLY a JSON object:
{ "isProspect": true/false, "companyName": "<company name or null>", "companyDomain": "<domain or null>", "confidence": "high"/"medium"/"low", "reason": "<brief explanation>" }`;

export interface PersonalEmailClassification {
  isProspect: boolean;
  companyName: string | null;
  companyDomain: string | null;
  confidence: string;
  reason: string;
}

export async function classifyPersonalEmail(
  anthropic: AnthropicBedrock,
  contactName: string,
  contactEmail: string,
  emailSubject: string,
  emailBodySnippet: string,
): Promise<PersonalEmailClassification> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Contact: ${contactName} (${contactEmail})\nSubject: ${emailSubject}\nBody preview:\n${emailBodySnippet.slice(0, 500)}`,
      },
    ],
    system: PERSONAL_EMAIL_CLASSIFICATION_PROMPT,
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  try {
    return JSON.parse(text) as PersonalEmailClassification;
  } catch {
    return {
      isProspect: true,
      companyName: null,
      companyDomain: null,
      confidence: "low",
      reason: "parse error",
    };
  }
}
