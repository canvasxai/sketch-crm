/**
 * Contact deduplication utilities.
 *
 * Provides helpers for normalising identifiers (e.g. LinkedIn URLs),
 * merging incoming data into existing records without overwriting values,
 * and name-based matching with nickname support.
 */

import { areFirstNamesEquivalent } from "./nicknames.js";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Normalises a LinkedIn profile URL to a canonical form for comparison.
 *
 * - Strips protocol and "www." prefix
 * - Removes trailing slashes
 * - Removes query parameters and fragment
 * - Lowercases the entire URL
 *
 * @example
 *   normalizeLinkedinUrl("https://www.LinkedIn.com/in/JaneDoe/?utm=abc")
 *   // "linkedin.com/in/janedoe"
 */
export function normalizeLinkedinUrl(url: string): string {
  let normalized = url.trim().toLowerCase();

  // Strip protocol
  normalized = normalized.replace(/^https?:\/\//, "");

  // Strip www.
  normalized = normalized.replace(/^www\./, "");

  // Remove query string and fragment
  const queryIndex = normalized.indexOf("?");
  if (queryIndex !== -1) normalized = normalized.slice(0, queryIndex);

  const hashIndex = normalized.indexOf("#");
  if (hashIndex !== -1) normalized = normalized.slice(0, hashIndex);

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "");

  return normalized;
}

/**
 * Computes a partial update object that only fills in missing (null/undefined)
 * fields from the incoming record, never overwriting existing non-null values.
 *
 * This is the core merge strategy for contact deduplication: existing data is
 * always preserved, and incoming data only supplements gaps.
 *
 * @returns An object containing only the fields that should be updated
 *          (i.e. fields that are null/undefined in `existing` but have a value
 *          in `incoming`). Returns an empty object if nothing needs updating.
 *
 * @example
 *   const existing = { name: "Jane", email: null, title: "CTO" };
 *   const incoming = { name: "Jane D.", email: "jane@acme.com", title: "CEO" };
 *   computeMergeUpdate(existing, incoming);
 *   // { email: "jane@acme.com" }
 *   // "name" kept as "Jane", "title" kept as "CTO"
 */
export function computeMergeUpdate(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  for (const key of Object.keys(incoming)) {
    const existingValue = existing[key];
    const incomingValue = incoming[key];

    // Only fill in if existing is null/undefined and incoming has a value
    if (
      (existingValue === null || existingValue === undefined) &&
      incomingValue !== null &&
      incomingValue !== undefined
    ) {
      update[key] = incomingValue;
    }
  }

  return update;
}

// ── AI response helpers ─────────────────────────────────────────────────────

/**
 * Strips markdown code fences (```json ... ```) that LLMs sometimes wrap
 * around JSON responses.
 */
export function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

const VALID_CONFIDENCES = new Set(["high", "medium", "low"]);

/**
 * Validates a confidence string, returning "low" if the value is invalid.
 */
export function normalizeConfidence(value: string | undefined | null): "high" | "medium" | "low" {
  if (value && VALID_CONFIDENCES.has(value)) return value as "high" | "medium" | "low";
  return "low";
}

// ── Name matching ───────────────────────────────────────────────────────────

/**
 * Extracts the first name from a full name string.
 * Handles prefixes like "Dr.", "Mr.", "Mrs." etc.
 *
 * @example extractFirstName("Dr. John Smith") → "john"
 * @example extractFirstName("Jane Doe") → "jane"
 */
export function extractFirstName(fullName: string): string {
  const prefixes = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "sir", "rev"]);
  const tokens = fullName.trim().toLowerCase().split(/\s+/);

  for (const token of tokens) {
    const cleaned = token.replace(/\.$/, ""); // strip trailing dot
    if (!prefixes.has(cleaned) && cleaned.length > 1) {
      return cleaned;
    }
  }

  return tokens[0]?.replace(/\.$/, "") ?? "";
}

/**
 * Extracts the last name from a full name string.
 * Returns empty string if only one name token.
 *
 * @example extractLastName("John Smith") → "smith"
 * @example extractLastName("Dr. J. Patel") → "patel"
 */
export function extractLastName(fullName: string): string {
  const tokens = fullName.trim().toLowerCase().split(/\s+/);
  if (tokens.length < 2) return "";
  return tokens[tokens.length - 1];
}

/**
 * Checks if two full names likely refer to the same person.
 * Uses nickname equivalence for first names and exact match for last names.
 *
 * @example areNamesCompatible("Robert Smith", "Bob Smith") → true
 * @example areNamesCompatible("John Smith", "John Jones") → false
 * @example areNamesCompatible("Dr. J. Patel", "Jay Patel") → false (initials not matched)
 */
export function areNamesCompatible(nameA: string, nameB: string): boolean {
  const lastA = extractLastName(nameA);
  const lastB = extractLastName(nameB);

  // Both must have a last name and they must match
  if (!lastA || !lastB || lastA !== lastB) return false;

  const firstA = extractFirstName(nameA);
  const firstB = extractFirstName(nameB);

  if (!firstA || !firstB) return false;

  // Skip single-letter initials — too ambiguous
  if (firstA.length === 1 || firstB.length === 1) return false;

  return areFirstNamesEquivalent(firstA, firstB);
}
