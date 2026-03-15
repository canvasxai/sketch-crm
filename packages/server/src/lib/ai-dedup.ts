/**
 * AI-powered contact deduplication and personal email classification.
 * Uses Claude Haiku via Bedrock for cost-effective inference.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createDedupCandidatesRepository } from "../db/repositories/dedup-candidates.js";
import { areNamesCompatible, normalizeConfidence, stripMarkdownFences } from "./dedup.js";

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

  let text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  // Strip markdown code fences if the model wraps its response
  text = stripMarkdownFences(text);

  try {
    const parsed = JSON.parse(text) as DedupResult;
    parsed.confidence = normalizeConfidence(parsed.confidence);
    return parsed;
  } catch {
    return { match: false, matchedIndex: null, confidence: "low", reason: "parse error" };
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
 * Only processes contacts that haven't been dedup-checked yet.
 * Returns the number of dedup candidates created.
 */
export async function runTier3Dedup(deps: Tier3Deps): Promise<number> {
  const uncheckedContacts = await deps.contacts.findNeedsDedupCheck(200);

  if (uncheckedContacts.length === 0) {
    console.log("[ai-dedup] No contacts need dedup checking");
    return 0;
  }

  console.log(`[ai-dedup] Tier 3: checking ${uncheckedContacts.length} contacts`);

  let candidatesCreated = 0;
  // Track pairs we've already checked in this run to avoid A↔B then B↔A
  const checkedPairs = new Set<string>();

  for (const contact of uncheckedContacts) {
    if (!contact.email && !contact.name) {
      await deps.contacts.markDedupChecked(contact.id);
      continue;
    }

    // Find similar names via trigram
    const similar = await deps.contacts.findByNameSimilarity(
      contact.name,
      contact.email ?? `__no_email_${contact.id}__`,
      10,
    );

    for (const candidate of similar) {
      if (candidate.id === contact.id) continue;

      // Build a canonical pair key to skip reverse direction
      const pairKey = [contact.id, candidate.id].sort().join(":");
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);

      // Skip if pair already exists in DB
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

    // Mark this contact as dedup-checked so we don't reprocess it
    await deps.contacts.markDedupChecked(contact.id);
  }

  console.log(`[ai-dedup] Tier 3 done: ${uncheckedContacts.length} checked, ${candidatesCreated} candidates created`);
  return candidatesCreated;
}
