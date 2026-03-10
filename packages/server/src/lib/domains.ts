/**
 * Email domain utilities for company detection and personal-email filtering.
 */

// Re-export the canonical list from shared
export { PERSONAL_EMAIL_DOMAINS, isPersonalEmailDomain } from "@crm/shared";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Extracts the domain from an email address, lowercased.
 *
 * Returns `null` if the email format is invalid.
 *
 * @example extractDomain("Alice@Acme.com") // "acme.com"
 */
export function extractDomain(email: string): string | null {
  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex < 1 || atIndex === trimmed.length - 1) return null;

  const domain = trimmed.slice(atIndex + 1).toLowerCase();

  // Basic validation: must contain at least one dot and no spaces
  if (!domain.includes(".") || /\s/.test(domain)) return null;

  return domain;
}

/**
 * Derives a human-readable company name from a domain.
 *
 * Strips the TLD, replaces hyphens with spaces, and title-cases each word.
 *
 * @example domainToCompanyName("acme.com")      // "Acme"
 * @example domainToCompanyName("tech-start.io") // "Tech Start"
 * @example domainToCompanyName("my.company.co.uk") // "My Company"
 */
export function domainToCompanyName(domain: string): string {
  const lower = domain.toLowerCase();

  // Strip common compound TLDs first, then simple TLD
  const withoutTld = lower
    .replace(/\.(co|com|org|net|ac|gov)\.[a-z]{2,3}$/, "")
    .replace(/\.[a-z]{2,63}$/, "");

  // Take the last segment (handles subdomains: "mail.acme" → "acme")
  const parts = withoutTld.split(".");
  const companyPart = parts[parts.length - 1] || withoutTld;

  // Replace hyphens/underscores with spaces and title-case
  return companyPart
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
