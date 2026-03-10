/**
 * CSV ingestion pipeline for importing contacts and activities.
 *
 * Parses raw CSV content, maps columns to CRM fields via a user-defined
 * column mapping, and auto-deduplicates contacts by email/name.
 */

import { parse } from "csv-parse/sync";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Maps CSV column headers to CRM contact/activity fields.
 *
 * Each value is the CSV column header string that corresponds to the CRM
 * field, or `null`/`undefined` if the field is not present in the CSV.
 */
export interface CsvColumnMapping {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
  companyName?: string | null;
  /** Message body (creates an activity record) */
  message?: string | null;
  /** Message timestamp (ISO 8601 or parseable date string) */
  timestamp?: string | null;
  /** Message direction: "inbound" | "outbound" */
  direction?: string | null;
  /** Contact source: "linkedin" | "gmail" | "manual" etc. */
  source?: string | null;
}

/** A contact parsed from a CSV row. */
export interface ParsedContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  companyName: string | null;
  /** Per-row source override (e.g. "linkedin", "gmail"). Null = use request default. */
  source: string | null;
}

/** An activity (message) parsed from a CSV row, linked by contact index. */
export interface ParsedActivity {
  /** Index into the returned contacts array */
  contactIndex: number;
  message: string;
  timestamp: string | null;
  direction: "inbound" | "outbound";
}

interface MapResult {
  contacts: ParsedContact[];
  activities: ParsedActivity[];
}

// ── CSV Parsing ─────────────────────────────────────────────────────────────

/**
 * Parses raw CSV content into an array of row objects.
 *
 * Uses the first row as column headers. Empty rows are skipped.
 * Handles quoted fields, multi-line values, and common CSV edge cases.
 */
export function parseCsv(csvContent: string): Record<string, string>[] {
  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];
}

// ── Column Mapping & Dedup ──────────────────────────────────────────────────

/**
 * Maps parsed CSV rows to CRM contacts and activities using the provided
 * column mapping. Automatically deduplicates contacts by email (primary) and
 * by lowercased name (fallback when email is absent).
 *
 * Activities are only created when the `message` mapping is provided and the
 * row contains a non-empty message value.
 */
export function mapCsvToContacts(
  rows: Record<string, string>[],
  mapping: CsvColumnMapping,
): MapResult {
  const contacts: ParsedContact[] = [];
  const activities: ParsedActivity[] = [];

  /** email (lowercased) -> contact index */
  const emailIndex = new Map<string, number>();
  /** name (lowercased, trimmed) -> contact index (fallback when no email) */
  const nameIndex = new Map<string, number>();

  for (const row of rows) {
    const name = getField(row, mapping.name);
    const email = getField(row, mapping.email)?.toLowerCase() ?? null;
    const phone = getField(row, mapping.phone);
    const title = getField(row, mapping.title);
    const linkedinUrl = getField(row, mapping.linkedinUrl);
    const companyName = getField(row, mapping.companyName);
    const message = getField(row, mapping.message);
    const timestamp = getField(row, mapping.timestamp);
    const rawDirection = getField(row, mapping.direction);
    const source = getField(row, mapping.source);

    // Resolve or create the contact
    let contactIdx: number;
    const existingIdx = findExistingContact(email, name, emailIndex, nameIndex);

    if (existingIdx !== null) {
      contactIdx = existingIdx;
      // Supplement missing fields on the existing contact
      mergeContact(contacts[contactIdx], {
        name,
        email,
        phone,
        title,
        linkedinUrl,
        companyName,
        source,
      });
    } else {
      // Skip rows that have neither email nor name -- cannot form a contact
      if (!email && !name) continue;

      contactIdx = contacts.length;
      contacts.push({ name, email, phone, title, linkedinUrl, companyName, source });

      if (email) emailIndex.set(email, contactIdx);
      if (name) nameIndex.set(name.toLowerCase().trim(), contactIdx);
    }

    // Create activity if a message is present
    if (message) {
      const direction = parseDirection(rawDirection);
      activities.push({
        contactIndex: contactIdx,
        message,
        timestamp: timestamp ?? null,
        direction,
      });
    }
  }

  return { contacts, activities };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads a field from a row using the mapped column header.
 * Returns `null` for missing/empty values.
 */
function getField(
  row: Record<string, string>,
  columnHeader: string | null | undefined,
): string | null {
  if (!columnHeader) return null;
  const value = row[columnHeader];
  if (!value || value.trim() === "") return null;
  return value.trim();
}

/**
 * Looks up an existing contact by email (primary) or name (fallback).
 */
function findExistingContact(
  email: string | null,
  name: string | null,
  emailMap: Map<string, number>,
  nameMap: Map<string, number>,
): number | null {
  if (email) {
    const idx = emailMap.get(email);
    if (idx !== undefined) return idx;
  }
  if (name) {
    const key = name.toLowerCase().trim();
    const idx = nameMap.get(key);
    if (idx !== undefined) return idx;
  }
  return null;
}

/**
 * Fills in null fields on an existing contact from a new row.
 * Never overwrites existing non-null values.
 */
function mergeContact(
  existing: ParsedContact,
  incoming: ParsedContact,
): void {
  if (!existing.name && incoming.name) existing.name = incoming.name;
  if (!existing.email && incoming.email) existing.email = incoming.email;
  if (!existing.phone && incoming.phone) existing.phone = incoming.phone;
  if (!existing.title && incoming.title) existing.title = incoming.title;
  if (!existing.linkedinUrl && incoming.linkedinUrl)
    existing.linkedinUrl = incoming.linkedinUrl;
  if (!existing.companyName && incoming.companyName)
    existing.companyName = incoming.companyName;
  if (!existing.source && incoming.source)
    existing.source = incoming.source;
}

/**
 * Normalises a direction string to "inbound" or "outbound".
 * Defaults to "inbound" for unrecognised values.
 */
function parseDirection(raw: string | null): "inbound" | "outbound" {
  if (!raw) return "inbound";
  const lower = raw.toLowerCase().trim();
  if (lower === "outbound" || lower === "out" || lower === "sent") {
    return "outbound";
  }
  return "inbound";
}
