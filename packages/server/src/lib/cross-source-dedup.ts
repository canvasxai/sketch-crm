/**
 * Cross-source contact dedup — matches Gmail contacts against LinkedIn contacts.
 *
 * Two passes, triggered at different times:
 *
 *   Pass 1 (free, batch): DB-only — find LinkedIn contacts at the same company
 *          with a compatible name or matching email in aimfox_profile_data.
 *          Runs after classification for all unenriched contacts.
 *
 *   Pass 2 (paid, per-contact): Web search + Haiku — search Canvas for
 *          "{name} {company} site:linkedin.com/in/", then Haiku confirms/disambiguates.
 *          Triggered when a contact is assigned to sales/client/hiring
 *          (either by AI classification or manual category change).
 *
 * On match: copies the LinkedIn URL to the Gmail contact + creates a dedup candidate.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createDedupCandidatesRepository } from "../db/repositories/dedup-candidates.js";
import type { CanvasClient } from "./canvas-client.js";
import { areNamesCompatible, normalizeConfidence, normalizeLinkedinUrl, stripMarkdownFences } from "./dedup.js";

const HAIKU_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// ── Shared types ──

interface BaseDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  dedupCandidates: ReturnType<typeof createDedupCandidatesRepository>;
}

interface AimfoxProfileData {
  emails?: Array<{ address: string; type?: string }>;
  [key: string]: unknown;
}

// ── Shared: handle a confirmed match ──

async function handleMatch(
  deps: BaseDeps,
  contactId: string,
  contactName: string,
  linkedinUrl: string,
  matchedContactId: string,
  matchedContactName: string,
  matchReason: string,
) {
  // Set LinkedIn URL on the Gmail contact
  await deps.contacts.update(contactId, { linkedinUrl });

  // Create dedup candidate if not already exists
  const alreadyExists = await deps.dedupCandidates.existsPair(contactId, matchedContactId);
  if (!alreadyExists) {
    await deps.dedupCandidates.create({
      contactIdA: contactId,
      contactIdB: matchedContactId,
      matchReason,
      aiConfidence: "high",
    });
    console.log(
      `[cross-source-dedup] Match: ${contactName} (gmail) ↔ ${matchedContactName} (linkedin) via ${normalizeLinkedinUrl(linkedinUrl)}`,
    );
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pass 1: DB-only batch matching (free)
// Runs after classification for all unenriched contacts.
// ═══════════════════════════════════════════════════════════════════════════

interface BatchResult {
  processed: number;
  matched: number;
  dedupCandidatesCreated: number;
  errors: string[];
}

/**
 * Batch DB-only cross-source matching.
 * For each unenriched Gmail contact: find LinkedIn contacts at the same company
 * with a compatible name or matching email in aimfox_profile_data.
 */
export async function crossSourceDbMatch(deps: BaseDeps): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    matched: 0,
    dedupCandidatesCreated: 0,
    errors: [],
  };

  const contacts = await deps.contacts.findUnenrichedGmailContacts(50);

  if (contacts.length === 0) {
    console.log("[cross-source-dedup] No unenriched contacts to process");
    return result;
  }

  console.log(`[cross-source-dedup] Pass 1 (DB): processing ${contacts.length} contacts`);

  for (const contact of contacts) {
    result.processed++;

    try {
      if (!contact.company_id) {
        await deps.contacts.markLinkedinEnriched(contact.id);
        continue;
      }

      // Find LinkedIn contacts at the same company
      const linkedinAtCompany = await deps.contacts.list({
        companyId: contact.company_id,
        source: "linkedin",
        limit: 50,
      });

      let matched = false;

      for (const candidate of linkedinAtCompany) {
        if (candidate.id === contact.id || !candidate.linkedin_url) continue;

        // Check name compatibility (handles Robert/Bob, etc.)
        if (areNamesCompatible(contact.name, candidate.name)) {
          const created = await handleMatch(
            deps,
            contact.id,
            contact.name,
            candidate.linkedin_url,
            candidate.id,
            candidate.name,
            `Cross-source: name match "${contact.name}" ↔ "${candidate.name}" at same company`,
          );
          result.matched++;
          if (created) result.dedupCandidatesCreated++;
          matched = true;
          break;
        }

        // Check aimfox_profile_data emails
        if (contact.email) {
          const profileData = candidate.aimfox_profile_data as AimfoxProfileData | null;
          if (profileData?.emails?.some(
            (e) => e.address?.toLowerCase() === contact.email?.toLowerCase(),
          )) {
            const created = await handleMatch(
              deps,
              contact.id,
              contact.name,
              candidate.linkedin_url,
              candidate.id,
              candidate.name,
              `Cross-source: email "${contact.email}" found in LinkedIn profile data`,
            );
            result.matched++;
            if (created) result.dedupCandidatesCreated++;
            matched = true;
            break;
          }
        }
      }

      // Mark as enriched whether matched or not — prevents reprocessing
      await deps.contacts.markLinkedinEnriched(contact.id);
    } catch (err) {
      result.errors.push(
        `Failed to process ${contact.name} (${contact.id}): ${err instanceof Error ? err.message : "unknown"}`,
      );
      try {
        await deps.contacts.markLinkedinEnriched(contact.id);
      } catch {
        // Ignore
      }
    }
  }

  console.log(
    `[cross-source-dedup] Pass 1 done: ${result.processed} processed, ${result.matched} matched, ${result.dedupCandidatesCreated} dedup candidates`,
  );

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pass 2: Web search + Haiku for a single contact (paid)
// Triggered when category is set to sales/client/hiring.
// ═══════════════════════════════════════════════════════════════════════════

interface SingleEnrichDeps extends BaseDeps {
  canvas: CanvasClient;
  anthropic: AnthropicBedrock;
  /** If provided, auto-merges matched contacts instead of creating dedup candidates. */
  autoMerge?: (keepContactId: string, mergeContactId: string) => Promise<void>;
}

// Categories that warrant the cost of web search + Haiku
const ENRICHMENT_CATEGORIES = new Set(["sales", "client", "hiring", "contractors"]);

/**
 * Check if a category value should trigger LinkedIn enrichment.
 */
export function shouldEnrichForCategory(category: string | null | undefined): boolean {
  return !!category && ENRICHMENT_CATEGORIES.has(category);
}

// ── LinkedIn URL extraction from web search ──

const LINKEDIN_PROFILE_REGEX = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[\w-]+/gi;

function extractLinkedinUrls(
  results: Array<{ url: string; title: string; snippet: string }>,
): Array<{ url: string; title: string; snippet: string }> {
  const seen = new Set<string>();
  const matches: Array<{ url: string; title: string; snippet: string }> = [];

  for (const result of results) {
    const urlMatches = result.url.match(LINKEDIN_PROFILE_REGEX);
    if (urlMatches) {
      for (const match of urlMatches) {
        const normalized = normalizeLinkedinUrl(match);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          matches.push({ url: match, title: result.title, snippet: result.snippet });
        }
      }
    }
  }

  return matches;
}

// ── Haiku disambiguation ──

const DISAMBIGUATE_PROMPT = `You are a CRM deduplication assistant. Given a contact with their name, email, and company, determine which LinkedIn profile (if any) belongs to this person.

Consider:
- Name matching (exact, nickname variations like Robert/Bob)
- Company matching (same company or related role)
- Title/role consistency

Respond with ONLY a JSON object:
{ "matchIndex": <0-based index or null if none match>, "confidence": "high"/"medium"/"low", "reason": "<brief explanation>" }`;

interface DisambiguationResult {
  matchIndex: number | null;
  confidence: string;
  reason: string;
}

async function disambiguateWithHaiku(
  anthropic: AnthropicBedrock,
  contactName: string,
  contactEmail: string,
  companyName: string,
  candidates: Array<{ url: string; title: string; snippet: string }>,
): Promise<DisambiguationResult> {
  const candidateList = candidates
    .map((c, i) => `  ${i}: ${c.url} — ${c.title} — ${c.snippet}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Contact: ${contactName} (${contactEmail}) at ${companyName}\n\nLinkedIn profiles:\n${candidateList}`,
      },
    ],
    system: DISAMBIGUATE_PROMPT,
  });

  let text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  // Strip markdown code fences if the model wraps its response
  text = stripMarkdownFences(text);

  try {
    const parsed = JSON.parse(text) as DisambiguationResult;
    parsed.confidence = normalizeConfidence(parsed.confidence);
    return parsed;
  } catch {
    return { matchIndex: null, confidence: "low", reason: "parse error" };
  }
}

/**
 * Enrich a single contact's LinkedIn URL via web search + Haiku.
 * Fire-and-forget — logs results, doesn't throw.
 *
 * Skips if the contact already has a LinkedIn URL.
 */
export async function enrichContactLinkedin(
  contactId: string,
  deps: SingleEnrichDeps,
): Promise<void> {
  try {
    const contact = await deps.contacts.findById(contactId);
    if (!contact) {
      console.log(`[linkedin-enrich] Contact ${contactId} not found, skipping`);
      return;
    }

    // Already has LinkedIn URL — nothing to do
    if (contact.linkedin_url) {
      console.log(`[linkedin-enrich] ${contact.name} already has LinkedIn URL: ${contact.linkedin_url}`);
      return;
    }

    // Build search query — use company name if available, otherwise just name + email
    let companyName: string | null = null;
    if (contact.company_id) {
      const company = await deps.companies.findById(contact.company_id);
      companyName = company?.name ?? null;
    }

    const queryParts = [contact.name];
    if (companyName) queryParts.push(companyName);
    else if (contact.email) queryParts.push(contact.email);
    queryParts.push("LinkedIn");
    const query = queryParts.join(" ");
    console.log(`[linkedin-enrich] Searching: ${query}`);

    const searchResults = await deps.canvas.webSearch(query, 5);
    console.log(`[linkedin-enrich] Canvas returned ${searchResults.length} results:`, searchResults.map(r => r.url));

    if (searchResults.length === 0) {
      console.log(`[linkedin-enrich] No search results for ${contact.name}`);
      await deps.contacts.markLinkedinEnriched(contact.id);
      return;
    }

    // Let Haiku pick the best LinkedIn profile from all search results
    console.log(`[linkedin-enrich] Asking Haiku to pick from ${searchResults.length} results...`);
    const disambiguation = await disambiguateWithHaiku(
      deps.anthropic,
      contact.name,
      contact.email ?? "",
      companyName ?? "",
      searchResults,
    );
    console.log(`[linkedin-enrich] Haiku response:`, JSON.stringify(disambiguation));

    let chosenUrl: string | null = null;
    let reason = "";

    if (
      disambiguation.matchIndex !== null &&
      disambiguation.confidence !== "low" &&
      disambiguation.matchIndex < searchResults.length
    ) {
      const chosen = searchResults[disambiguation.matchIndex];
      // Extract LinkedIn profile URL — Haiku may pick a result that's a LinkedIn /in/ URL or a /posts/ URL
      const profileMatch = chosen.url.match(/https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[\w-]+/i);
      if (profileMatch) {
        chosenUrl = profileMatch[0];
        reason = `Web search + AI selected (${disambiguation.confidence}: ${disambiguation.reason})`;
      } else {
        console.log(`[linkedin-enrich] Haiku picked non-profile URL: ${chosen.url}`);
      }
    } else {
      console.log(`[linkedin-enrich] Haiku could not find a match (matchIndex=${disambiguation.matchIndex}, confidence=${disambiguation.confidence})`);
    }

    console.log(`[linkedin-enrich] Result for ${contact.name}: ${chosenUrl ?? "no match"}`);


    if (chosenUrl) {
      const normalizedUrl = normalizeLinkedinUrl(chosenUrl);

      // Set LinkedIn URL
      await deps.contacts.update(contact.id, { linkedinUrl: chosenUrl });

      // Check for cross-source match
      const existingContact = await deps.contacts.findByLinkedinUrl(normalizedUrl);
      if (existingContact && existingContact.id !== contact.id) {
        if (deps.autoMerge) {
          // Auto-merge: keep the LinkedIn contact (richer profile), merge the Gmail one into it
          try {
            await deps.autoMerge(existingContact.id, contact.id);
            console.log(
              `[cross-source-dedup] Auto-merged: ${contact.name} (gmail) → ${existingContact.name} (linkedin) via ${normalizedUrl}`,
            );
          } catch (err) {
            console.error(`[cross-source-dedup] Auto-merge failed, creating dedup candidate instead:`, err);
            // Fall back to dedup candidate
            const alreadyExists = await deps.dedupCandidates.existsPair(contact.id, existingContact.id);
            if (!alreadyExists) {
              await deps.dedupCandidates.create({
                contactIdA: contact.id,
                contactIdB: existingContact.id,
                matchReason: `Cross-source: ${reason}`,
                aiConfidence: "high",
              });
            }
          }
        } else {
          const alreadyExists = await deps.dedupCandidates.existsPair(contact.id, existingContact.id);
          if (!alreadyExists) {
            await deps.dedupCandidates.create({
              contactIdA: contact.id,
              contactIdB: existingContact.id,
              matchReason: `Cross-source: ${reason}`,
              aiConfidence: "high",
            });
            console.log(
              `[cross-source-dedup] Match: ${contact.name} (gmail) ↔ ${existingContact.name} (linkedin) via ${normalizedUrl}`,
            );
          }
        }
      }

      console.log(`[cross-source-dedup] Enriched ${contact.name} → ${normalizedUrl}`);
    }

    await deps.contacts.markLinkedinEnriched(contact.id);
  } catch (err) {
    console.error(
      `[cross-source-dedup] Pass 2 failed for ${contactId}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}
