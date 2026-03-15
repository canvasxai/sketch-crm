/**
 * Shared contact matching and creation logic.
 * Used by Gmail sync, Fireflies sync, and any future ingestion source.
 *
 * Matching tiers:
 *  1. Exact email match (checks primary email + JSONB emails array)
 *  2. Name + company domain match (catches same person, different email)
 *  3. No match → create new contact + auto-create company from business domain
 */

import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import { extractDomain, isPersonalEmailDomain, domainToCompanyName } from "./domains.js";

interface MatcherDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
}

export interface MatchResult {
  contactId: string;
  created: boolean;
  companyCreated: boolean;
}

/**
 * Find an existing contact by email (Tier 1 + Tier 2 dedup) or create a new
 * one with auto-created company from business domain.
 *
 * @param email       - The email to match/create
 * @param name        - Display name (used for Tier 2 matching and new contact creation)
 * @param source      - Source tag for new contacts (e.g. "gmail", "fireflies")
 * @param opts.createdByUserId - Optional user ID for visibility tracking
 */
export async function findOrCreateContactByEmail(
  email: string,
  name: string,
  source: string,
  deps: MatcherDeps,
  opts?: { createdByUserId?: string },
): Promise<MatchResult> {
  // Tier 1: exact email match (checks primary email + JSONB emails array)
  const tier1 = await deps.contacts.findDuplicate({ email });

  if (tier1) {
    // Append email to contact's emails array if it's a new alias
    if (tier1.contact.email?.toLowerCase() !== email.toLowerCase()) {
      await deps.contacts.appendEmail(tier1.contact.id, {
        email,
        type: "work",
        isPrimary: false,
      });
    }
    return { contactId: tier1.contact.id, created: false, companyCreated: false };
  }

  // Auto-create company from business domain
  let companyId: string | null = null;
  let companyCategory: string | null = null;
  let companyCreated = false;
  const domain = extractDomain(email);

  if (domain && !isPersonalEmailDomain(domain)) {
    const company = await deps.companies.findOrCreateByDomain(domain, {
      name: domainToCompanyName(domain),
      source,
    });
    companyId = company.id;
    companyCategory = company.category ?? null;
    if (Date.now() - new Date(company.created_at).getTime() < 5000) {
      companyCreated = true;
    }
  }

  // Tier 2: name + company domain match (catches same person, different email)
  const tier2 = domain
    ? await deps.contacts.findDuplicate({ name, companyDomain: domain })
    : null;

  if (tier2) {
    const contactId = tier2.contact.id;
    await deps.contacts.appendEmail(contactId, {
      email,
      type: "work",
      isPrimary: false,
    });
    if (!tier2.contact.email) {
      await deps.contacts.update(contactId, { email });
    }
    if (!tier2.contact.company_id && companyId) {
      await deps.contacts.update(contactId, { companyId });
    }
    await deps.contacts.setNeedsClassification([contactId]);
    return { contactId, created: false, companyCreated };
  }

  // No match — create new contact
  const contact = await deps.contacts.create({
    name,
    email,
    source,
    companyId: companyId ?? undefined,
    visibility: "unreviewed",
    createdByUserId: opts?.createdByUserId,
  });

  // Inherit company category if already classified
  if (companyCategory && companyCategory !== "uncategorized") {
    await deps.contacts.updateClassification(contact.id, {
      aiSummary: null,
      category: companyCategory,
    });
  }

  return { contactId: contact.id, created: true, companyCreated };
}

/**
 * Derive a display name from an email local part.
 * e.g. "jane.smith" → "Jane Smith", "jsmith_work" → "Jsmith Work"
 */
export function nameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
