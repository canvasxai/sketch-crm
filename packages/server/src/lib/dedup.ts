/**
 * Contact deduplication utilities.
 *
 * Provides helpers for normalising identifiers (e.g. LinkedIn URLs) and
 * merging incoming data into existing records without overwriting values.
 */

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
