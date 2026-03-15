/**
 * Gmail sync orchestration — fetches emails from Gmail API,
 * creates contacts/companies, and stores emails in the database.
 */

import type { Config } from "../config.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createGmailSyncStateRepository } from "../db/repositories/gmail-sync-state.js";
import type { createOrgSettingsRepository } from "../db/repositories/org-settings.js";
import type { createUsersRepository } from "../db/repositories/users.js";
import type { createMutedDomainsRepository } from "../db/repositories/muted-domains.js";
import { extractDomain, isPersonalEmailDomain } from "./domains.js";
import { GmailClient, extractAllParticipants, extractBody, getHeader, parseEmailAddress } from "./gmail.js";
import { findOrCreateContactByEmail } from "./contact-matcher.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BATCH_SIZE = 50;
const MAX_CONCURRENT_FETCHES = 10;
const MAX_BODY_LENGTH = 50_000;

type SyncPeriod = "5days" | "1month" | "3months" | "6months" | "1year" | "all";

export interface SyncDateRange {
  after: string; // ISO date string
  before: string; // ISO date string
}

interface SyncDeps {
  users: ReturnType<typeof createUsersRepository>;
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  gmailSyncState: ReturnType<typeof createGmailSyncStateRepository>;
  orgSettings: ReturnType<typeof createOrgSettingsRepository>;
  mutedDomains: ReturnType<typeof createMutedDomainsRepository>;
}

export interface SyncResult {
  emailsSynced: number;
  contactsCreated: number;
  companiesCreated: number;
  ownersAssigned: number;
  oldestEmailAt: string | null;
  newestEmailAt: string | null;
  errors: string[];
}

/**
 * Refreshes a Gmail access token using the refresh token.
 */
export async function refreshGmailToken(
  refreshToken: string,
  config: Config,
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.GOOGLE_CLIENT_ID,
    client_secret: config.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Gmail token refresh failed (${res.status})`);
  }

  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

/**
 * Gets a valid Gmail access token for a user, refreshing if expired.
 */
async function getValidToken(
  user: {
    id: string;
    google_access_token: string | null;
    google_refresh_token: string | null;
    google_token_expiry: string | null;
  },
  deps: SyncDeps,
  config: Config,
): Promise<string> {
  if (!user.google_access_token || !user.google_refresh_token) {
    throw new Error("No Gmail tokens found. Please re-login.");
  }

  // Check if token is still valid (with 5-minute buffer)
  if (user.google_token_expiry) {
    const expiry = new Date(user.google_token_expiry);
    if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
      return user.google_access_token;
    }
  }

  // Token expired — refresh it
  const refreshed = await refreshGmailToken(user.google_refresh_token, config);

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await deps.users.update(user.id, {
    googleAccessToken: refreshed.access_token,
    googleTokenExpiry: newExpiry,
  });

  return refreshed.access_token;
}

/**
 * Formats a Date as YYYY/MM/DD for Gmail query.
 */
function formatGmailDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/**
 * Builds a Gmail search query for the given sync period.
 */
function buildDateQuery(syncPeriod: SyncPeriod): string {
  if (syncPeriod === "all") return "";

  const ms: Record<string, number> = {
    "5days": 5,
    "1month": 30,
    "3months": 90,
    "6months": 180,
    "1year": 365,
  };

  const days = ms[syncPeriod] ?? 90;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return `after:${formatGmailDate(date)}`;
}

/**
 * Builds a Gmail search query from absolute date range.
 */
function buildDateRangeQuery(range: SyncDateRange): string {
  const parts: string[] = [];
  parts.push(`after:${formatGmailDate(new Date(range.after))}`);
  parts.push(`before:${formatGmailDate(new Date(range.before))}`);
  return parts.join(" ");
}

/**
 * Fetches messages in parallel with concurrency limit.
 */
async function fetchMessagesInBatch(
  client: GmailClient,
  messageIds: string[],
): Promise<
  Array<{
    id: string;
    message: Awaited<ReturnType<GmailClient["getMessage"]>> | null;
    error?: string;
  }>
> {
  const results: Array<{
    id: string;
    message: Awaited<ReturnType<GmailClient["getMessage"]>> | null;
    error?: string;
  }> = [];

  // Process in chunks of MAX_CONCURRENT_FETCHES
  for (let i = 0; i < messageIds.length; i += MAX_CONCURRENT_FETCHES) {
    const chunk = messageIds.slice(i, i + MAX_CONCURRENT_FETCHES);
    const settled = await Promise.allSettled(chunk.map((id) => client.getMessage(id)));

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      if (result.status === "fulfilled") {
        results.push({ id: chunk[j], message: result.value });
      } else {
        results.push({
          id: chunk[j],
          message: null,
          error: result.reason?.message ?? "Unknown error",
        });
      }
    }
  }

  return results;
}

/**
 * Main sync function — fetches Gmail emails and creates contacts/companies.
 * Accepts either a relative SyncPeriod or an absolute SyncDateRange.
 */
export async function syncGmailEmails(
  deps: SyncDeps,
  config: Config,
  userId: string,
  syncPeriodOrRange: SyncPeriod | SyncDateRange,
): Promise<SyncResult> {
  const result: SyncResult = {
    emailsSynced: 0,
    contactsCreated: 0,
    companiesCreated: 0,
    ownersAssigned: 0,
    oldestEmailAt: null,
    newestEmailAt: null,
    errors: [],
  };

  // Get user and valid token
  const user = await deps.users.findById(userId);
  if (!user) throw new Error("User not found");

  const accessToken = await getValidToken(
    user as typeof user & {
      google_access_token: string | null;
      google_refresh_token: string | null;
      google_token_expiry: string | null;
    },
    deps,
    config,
  );

  const client = new GmailClient(accessToken);

  // Get the user's own email to determine inbound vs outbound
  const profile = await client.getProfile();
  const userEmail = profile.emailAddress.toLowerCase();

  // Mark sync as in progress
  await deps.gmailSyncState.upsert(userId, {
    status: "syncing",
    errorMessage: null,
  });

  try {
    // Load domain filters — always include the user's own email domain
    const configuredInternalDomains = await deps.orgSettings.getInternalDomains();
    const userDomain = extractDomain(userEmail);
    const internalDomains =
      userDomain && !configuredInternalDomains.includes(userDomain)
        ? [...configuredInternalDomains, userDomain]
        : configuredInternalDomains;
    const mutedDomains = await deps.mutedDomains.getDomainList();

    const query = typeof syncPeriodOrRange === "string"
      ? buildDateQuery(syncPeriodOrRange)
      : buildDateRangeQuery(syncPeriodOrRange);
    let pageToken: string | undefined;

    // Paginate through all messages
    do {
      const listResponse = await client.listMessages({
        query: query || undefined,
        maxResults: BATCH_SIZE,
        pageToken,
      });

      if (!listResponse.messages || listResponse.messages.length === 0) break;

      const messageIds = listResponse.messages.map((m) => m.id);
      const fetched = await fetchMessagesInBatch(client, messageIds);

      for (const { message, error } of fetched) {
        if (!message) {
          if (error) result.errors.push(error);
          continue;
        }

        // Track oldest/newest email timestamps
        if (message.internalDate) {
          const emailDate = new Date(Number.parseInt(message.internalDate)).toISOString();
          if (!result.oldestEmailAt || emailDate < result.oldestEmailAt) {
            result.oldestEmailAt = emailDate;
          }
          if (!result.newestEmailAt || emailDate > result.newestEmailAt) {
            result.newestEmailAt = emailDate;
          }
        }

        try {
          await processMessage(message, userEmail, userId, internalDomains, mutedDomains, deps, result);
        } catch (err) {
          result.errors.push(`Message ${message.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      // Update counters incrementally
      await deps.gmailSyncState.upsert(userId, {
        emailsSynced: result.emailsSynced,
        contactsCreated: result.contactsCreated,
        companiesCreated: result.companiesCreated,
      });

      pageToken = listResponse.nextPageToken;
    } while (pageToken);

    // Merge date range with existing state — expand the window, never shrink
    const existingState = await deps.gmailSyncState.findByUser(userId);
    const existingOldest = existingState?.oldest_email_at ?? null;
    const existingNewest = existingState?.newest_email_at ?? null;
    const finalOldest = existingOldest && result.oldestEmailAt
      ? (existingOldest < result.oldestEmailAt ? existingOldest : result.oldestEmailAt)
      : result.oldestEmailAt ?? existingOldest;
    const finalNewest = existingNewest && result.newestEmailAt
      ? (existingNewest > result.newestEmailAt ? existingNewest : result.newestEmailAt)
      : result.newestEmailAt ?? existingNewest;

    // Mark sync complete
    await deps.gmailSyncState.upsert(userId, {
      status: "idle",
      lastSyncAt: new Date().toISOString(),
      emailsSynced: result.emailsSynced,
      contactsCreated: result.contactsCreated,
      companiesCreated: result.companiesCreated,
      oldestEmailAt: finalOldest,
      newestEmailAt: finalNewest,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown sync error";
    await deps.gmailSyncState.updateStatus(userId, "error", errorMessage);
    result.errors.push(errorMessage);
  }

  return result;
}

/**
 * Checks if an email address belongs to an internal domain.
 */
function isInternalDomain(email: string, internalDomains: string[]): boolean {
  if (internalDomains.length === 0) return false;
  const domain = extractDomain(email);
  return domain ? internalDomains.includes(domain.toLowerCase()) : false;
}

/**
 * Checks if an email address belongs to a muted/promotional domain.
 */
function isMutedDomain(email: string, mutedDomains: string[]): boolean {
  if (mutedDomains.length === 0) return false;
  const domain = extractDomain(email);
  return domain ? mutedDomains.includes(domain.toLowerCase()) : false;
}

/**
 * Processes a single Gmail message — creates contacts, companies, and email record.
 * Skips emails where ALL participants are from internal domains.
 * New contacts from Gmail sync are created with visibility: "unreviewed".
 * Auto-assigns owners: any internal-domain participant becomes owner of contacts + companies.
 * Dedup: exact email match only — same email = same person.
 */
async function processMessage(
  message: Awaited<ReturnType<GmailClient["getMessage"]>>,
  userEmail: string,
  syncingUserId: string,
  internalDomains: string[],
  mutedDomains: string[],
  deps: SyncDeps,
  result: SyncResult,
): Promise<void> {
  // Skip Gmail promotional emails
  if (message.labelIds?.includes("CATEGORY_PROMOTIONS")) return;

  const from = getHeader(message, "From");
  const to = getHeader(message, "To");
  const cc = getHeader(message, "Cc");
  const subject = getHeader(message, "Subject");
  const messageId = getHeader(message, "Message-ID");
  const inReplyTo = getHeader(message, "In-Reply-To");

  const fromEmail = from ? parseEmailAddress(from) : null;
  if (!fromEmail) return;

  // Skip emails from muted/promotional domains
  if (isMutedDomain(fromEmail, mutedDomains)) return;

  // Determine direction
  const direction = fromEmail === userEmail ? "outbound" : "inbound";

  // Get all participants (including user, for owner assignment later)
  const allParticipantsIncludingUser = extractAllParticipants(message);

  // External participants = all participants minus the syncing user
  const allParticipants = new Set(allParticipantsIncludingUser);
  allParticipants.delete(userEmail);

  if (allParticipants.size === 0) return; // Self-email

  // Skip if ALL participants are from internal domains
  if (internalDomains.length > 0) {
    const allInternal = [...allParticipants].every((p) => isInternalDomain(p, internalDomains));
    const senderInternal = isInternalDomain(fromEmail, internalDomains) || fromEmail === userEmail;
    if (allInternal && senderInternal) return;
  }

  // Extract body (truncated)
  const extracted = extractBody(message);
  let body = extracted.plain;
  if (body.length > MAX_BODY_LENGTH) {
    body = body.slice(0, MAX_BODY_LENGTH);
  }
  let bodyHtml = extracted.html;
  if (bodyHtml && bodyHtml.length > MAX_BODY_LENGTH) {
    bodyHtml = bodyHtml.slice(0, MAX_BODY_LENGTH);
  }

  const sentAt = new Date(Number.parseInt(message.internalDate)).toISOString();

  // For each external participant, ensure contact + company exist
  const contactIds = new Set<string>();

  for (const participantEmail of allParticipants) {
    // Skip internal domain participants (don't create contacts for them)
    if (isInternalDomain(participantEmail, internalDomains)) continue;

    const name = extractDisplayName(participantEmail, allParticipants, message);
    const match = await findOrCreateContactByEmail(
      participantEmail,
      name,
      "gmail",
      { contacts: deps.contacts, companies: deps.companies },
      { createdByUserId: syncingUserId },
    );

    if (match.created) result.contactsCreated++;
    if (match.companyCreated) result.companiesCreated++;
    contactIds.add(match.contactId);
  }

  // ── Owner assignment: all internal-domain participants become owners ──
  const internalParticipantEmails: string[] = [];
  for (const participant of allParticipantsIncludingUser) {
    if (isInternalDomain(participant, internalDomains) || participant === userEmail) {
      internalParticipantEmails.push(participant);
    }
  }

  if (internalParticipantEmails.length > 0 && contactIds.size > 0) {
    const internalUsers = await deps.users.findByEmails(internalParticipantEmails);
    const internalUserIds = internalUsers.map((u) => u.id);

    for (const contactId of contactIds) {
      for (const userId of internalUserIds) {
        await deps.contacts.addOwner(contactId, userId);
        result.ownersAssigned++;
      }

      // Propagate to company owners
      const contact = await deps.contacts.findById(contactId);
      if (contact?.company_id) {
        for (const userId of internalUserIds) {
          await deps.companies.addOwner(contact.company_id, userId);
        }
      }
    }
  }

  // Store the email linked to the primary contact (From for inbound, first To for outbound)
  const primaryContactEmail = direction === "inbound" ? fromEmail : [...allParticipants][0];

  const primaryDuplicate = await deps.contacts.findDuplicate({
    email: primaryContactEmail,
  });
  const primaryContactId = primaryDuplicate?.contact.id ?? [...contactIds][0];

  if (!primaryContactId) return;

  // Create email record with dedup on gmail_message_id
  const created = await deps.emails.createFromGmail({
    contactId: primaryContactId,
    subject: subject ?? null,
    body,
    bodyHtml: bodyHtml ?? null,
    fromEmail: fromEmail,
    toEmail: to ? parseEmailAddress(to) : null,
    cc: cc ?? null,
    threadId: message.threadId,
    inReplyTo: inReplyTo ?? null,
    direction,
    sentAt,
    source: "gmail",
    gmailMessageId: message.id,
  });

  if (created) {
    result.emailsSynced++;
    // New email data — flag contact for re-classification
    await deps.contacts.setNeedsClassification([primaryContactId]);
  }
}

/**
 * Extracts a display name from the email participants.
 */
function extractDisplayName(
  email: string,
  _participants: Set<string>,
  message: Awaited<ReturnType<GmailClient["getMessage"]>>,
): string {
  // Try to find the name from message headers
  for (const headerName of ["From", "To", "Cc"]) {
    const value = getHeader(message, headerName);
    if (!value) continue;
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      const match = trimmed.match(/^(.+?)\s*<([^>]+)>/);
      if (match && match[2].trim().toLowerCase() === email) {
        const name = match[1].replace(/^["']|["']$/g, "").trim();
        if (name && name !== email) return name;
      }
    }
  }

  // Fallback: use the part before @ and title-case it
  const local = email.split("@")[0];
  return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
