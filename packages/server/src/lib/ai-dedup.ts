/**
 * AI-powered contact deduplication and personal email classification.
 * Uses Claude Haiku via Bedrock for cost-effective inference.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createDedupCandidatesRepository } from "../db/repositories/dedup-candidates.js";
import { areNamesCompatible } from "./dedup.js";

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

// ── Tier 3: Post-ingestion fuzzy dedup ──

interface Tier3Deps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  dedupCandidates: ReturnType<typeof createDedupCandidatesRepository>;
  anthropic: AnthropicBedrock;
}

/**
 * Run Tier 3 dedup on recently classified contacts.
 * Uses trigram similarity to find candidates, then AI to confirm ambiguous matches.
 * Returns the number of dedup candidates created.
 */
export async function runTier3Dedup(deps: Tier3Deps): Promise<number> {
  // Get all contacts to check — in practice we'd want a "last_dedup_checked_at" field
  // For now, check all contacts that have never been part of a dedup candidate

  // Get all contacts to check — in practice we'd want a "last_dedup_checked_at" field
  // For now, check all contacts that have never been part of a dedup candidate
  const allContacts = await deps.contacts.list({ limit: 500 });

  let candidatesCreated = 0;

  for (const contact of allContacts) {
    if (!contact.email && !contact.name) continue;

    // Find similar names via trigram
    const similar = await deps.contacts.findByNameSimilarity(
      contact.name,
      contact.email ?? `__no_email_${contact.id}__`,
      10,
    );

    for (const candidate of similar) {
      if (candidate.id === contact.id) continue;

      // Skip if pair already exists
      const exists = await deps.dedupCandidates.existsPair(contact.id, candidate.id);
      if (exists) continue;

      // Check if they're at the same company — if so, nickname check (promotes to auto-merge)
      if (
        contact.company_id &&
        candidate.company_id &&
        contact.company_id === candidate.company_id &&
        areNamesCompatible(contact.name, candidate.name)
      ) {
        // Same company + compatible names — high confidence match
        await deps.dedupCandidates.create({
          contactIdA: contact.id,
          contactIdB: candidate.id,
          matchReason: "Same company, compatible names (nickname match)",
          aiConfidence: "high",
        });
        candidatesCreated++;
        continue;
      }

      // For ambiguous cases, use AI
      try {
        const result = await checkNameDedup(
          deps.anthropic,
          contact.name,
          contact.email ?? "",
          [{ name: candidate.name, email: candidate.email, id: candidate.id }],
        );

        if (result.match && result.confidence !== "low") {
          await deps.dedupCandidates.create({
            contactIdA: contact.id,
            contactIdB: candidate.id,
            matchReason: result.reason,
            aiConfidence: result.confidence,
          });
          candidatesCreated++;
        }
      } catch (err) {
        console.warn(`[ai-dedup] Failed to check pair ${contact.id}/${candidate.id}:`, err);
      }
    }
  }

  return candidatesCreated;
}
