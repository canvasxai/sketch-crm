/**
 * Gmail sync orchestration — fetches emails from Gmail API,
 * creates contacts/companies, and stores emails in the database.
 */

import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { Config } from "../config.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createDedupLogRepository } from "../db/repositories/dedup-log.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createGmailSyncStateRepository } from "../db/repositories/gmail-sync-state.js";
import type { createOrgSettingsRepository } from "../db/repositories/org-settings.js";
import type { createUsersRepository } from "../db/repositories/users.js";
import type { createVendorDomainsRepository } from "../db/repositories/vendor-domains.js";
import { checkNameDedup, classifyPersonalEmail } from "./ai-dedup.js";
import { domainToCompanyName, extractDomain, isPersonalEmailDomain } from "./domains.js";
import { GmailClient, extractAllParticipants, extractBody, getHeader, parseEmailAddress } from "./gmail.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BATCH_SIZE = 50;
const MAX_CONCURRENT_FETCHES = 10;
const MAX_BODY_LENGTH = 50_000;

type SyncPeriod = "1month" | "3months" | "6months" | "1year" | "all";

interface SyncDeps {
  users: ReturnType<typeof createUsersRepository>;
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  gmailSyncState: ReturnType<typeof createGmailSyncStateRepository>;
  orgSettings: ReturnType<typeof createOrgSettingsRepository>;
  vendorDomains: ReturnType<typeof createVendorDomainsRepository>;
  dedupLog: ReturnType<typeof createDedupLogRepository>;
}

export interface SyncResult {
  emailsSynced: number;
  contactsCreated: number;
  companiesCreated: number;
  ownersAssigned: number;
  dedupMerges: number;
  personalEmailsClassified: number;
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
 * Builds a Gmail search query for the given sync period.
 */
function buildDateQuery(syncPeriod: SyncPeriod): string {
  if (syncPeriod === "all") return "";

  const ms: Record<string, number> = {
    "1month": 30,
    "3months": 90,
    "6months": 180,
    "1year": 365,
  };

  const days = ms[syncPeriod] ?? 90;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `after:${y}/${m}/${d}`;
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
 */
export async function syncGmailEmails(
  deps: SyncDeps,
  config: Config,
  userId: string,
  syncPeriod: SyncPeriod,
): Promise<SyncResult> {
  const result: SyncResult = {
    emailsSynced: 0,
    contactsCreated: 0,
    companiesCreated: 0,
    ownersAssigned: 0,
    dedupMerges: 0,
    personalEmailsClassified: 0,
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

  // Create Bedrock client for AI dedup/classification (if credentials configured)
  let anthropic: AnthropicBedrock | null = null;
  if (config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY) {
    const { default: AnthropicBedrockClient } = await import("@anthropic-ai/bedrock-sdk");
    anthropic = new AnthropicBedrockClient({
      awsAccessKey: config.AWS_ACCESS_KEY_ID,
      awsSecretKey: config.AWS_SECRET_ACCESS_KEY,
      awsRegion: config.AWS_REGION ?? "us-east-1",
    });
  }

  // Mark sync as in progress
  await deps.gmailSyncState.upsert(userId, {
    status: "syncing",
    errorMessage: null,
  });

  try {
    // Load domain filters
    const internalDomains = await deps.orgSettings.getInternalDomains();
    const vendorDomains = await deps.vendorDomains.getDomainList();

    const query = buildDateQuery(syncPeriod);
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

        try {
          await processMessage(message, userEmail, userId, internalDomains, vendorDomains, deps, result, anthropic);
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

    // Mark sync complete
    await deps.gmailSyncState.upsert(userId, {
      status: "idle",
      lastSyncAt: new Date().toISOString(),
      emailsSynced: result.emailsSynced,
      contactsCreated: result.contactsCreated,
      companiesCreated: result.companiesCreated,
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
 * Checks if an email address belongs to a vendor/promotional domain.
 */
function isVendorDomain(email: string, vendorDomains: string[]): boolean {
  if (vendorDomains.length === 0) return false;
  const domain = extractDomain(email);
  return domain ? vendorDomains.includes(domain.toLowerCase()) : false;
}

/**
 * Processes a single Gmail message — creates contacts, companies, and email record.
 * Skips emails where ALL participants are from internal domains.
 * New contacts from Gmail sync are created with visibility: "unreviewed" and funnel_stage: "new".
 * Auto-assigns owners: any internal-domain participant becomes owner of contacts + companies.
 * AI dedup: if a new email doesn't match but the name is similar, uses Haiku to detect same person.
 * AI classification: for personal domain emails, classifies as prospect and extracts company info.
 */
async function processMessage(
  message: Awaited<ReturnType<GmailClient["getMessage"]>>,
  userEmail: string,
  syncingUserId: string,
  internalDomains: string[],
  vendorDomains: string[],
  deps: SyncDeps,
  result: SyncResult,
  anthropic: AnthropicBedrock | null,
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

  // Skip emails from vendor/promotional domains
  if (isVendorDomain(fromEmail, vendorDomains)) return;

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

    // Find or create contact
    const duplicate = await deps.contacts.findDuplicate({
      email: participantEmail,
    });

    let contactId: string;

    if (duplicate) {
      contactId = duplicate.contact.id;

      // Append this email to the contact's emails array if not already tracked
      if (duplicate.contact.email?.toLowerCase() !== participantEmail.toLowerCase()) {
        await deps.contacts.appendEmail(contactId, {
          email: participantEmail,
          type: "work",
          isPrimary: false,
        });
      }
    } else {
      // No exact email match — try AI name-based dedup before creating new contact
      const name = extractDisplayName(participantEmail, allParticipants, message);
      let mergedViaAi = false;

      if (anthropic && name) {
        try {
          const candidates = await deps.contacts.findByNameSimilarity(name, participantEmail, 5);
          if (candidates.length > 0) {
            const dedupResult = await checkNameDedup(
              anthropic,
              name,
              participantEmail,
              candidates.map((c) => ({ name: c.name, email: c.email, id: c.id })),
            );

            if (dedupResult.match && dedupResult.matchedIndex !== null) {
              const matchedContact = candidates[dedupResult.matchedIndex];
              if (matchedContact) {
                contactId = matchedContact.id;
                mergedViaAi = true;

                // Append the new email to the matched contact
                await deps.contacts.appendEmail(matchedContact.id, {
                  email: participantEmail,
                  type: "work",
                  isPrimary: false,
                });

                // Log the dedup event for frontend review
                await deps.dedupLog.create({
                  contactId: matchedContact.id,
                  mergedEmail: participantEmail,
                  mergedName: name,
                  matchReason: "ai_name_similarity",
                  aiConfidence: `${dedupResult.confidence}: ${dedupResult.reason}`,
                });

                result.dedupMerges++;
              }
            }
          }
        } catch (err) {
          result.errors.push(
            `AI dedup error for ${participantEmail}: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }

      if (!mergedViaAi) {
        // Create new contact + company
        let companyId: string | null = null;
        const domain = extractDomain(participantEmail);

        if (domain && !isPersonalEmailDomain(domain)) {
          // Business domain — auto-create company
          const company = await deps.companies.findOrCreateByDomain(domain, {
            name: domainToCompanyName(domain),
            source: "email_domain",
          });
          companyId = company.id;
          const timeDiff = Date.now() - new Date(company.created_at).getTime();
          if (timeDiff < 5000) {
            result.companiesCreated++;
          }
        } else if (domain && isPersonalEmailDomain(domain) && anthropic) {
          // Personal domain — use AI to classify and extract company info
          try {
            const classification = await classifyPersonalEmail(
              anthropic,
              name,
              participantEmail,
              subject ?? "",
              body.slice(0, 500),
            );
            result.personalEmailsClassified++;

            if (classification.isProspect && classification.companyDomain) {
              const company = await deps.companies.findOrCreateByDomain(
                classification.companyDomain,
                {
                  name: classification.companyName ?? domainToCompanyName(classification.companyDomain),
                  source: "email_domain",
                },
              );
              companyId = company.id;
              const timeDiff = Date.now() - new Date(company.created_at).getTime();
              if (timeDiff < 5000) {
                result.companiesCreated++;
              }
            }
            // If not a prospect or no company info, contact exists without company (allowed)
          } catch {
            // AI classification is best-effort — silently continue
          }
        }

        const contact = await deps.contacts.create({
          name,
          email: participantEmail,
          source: "gmail",
          funnelStage: "new",
          companyId: companyId ?? undefined,
          visibility: "unreviewed",
          createdByUserId: syncingUserId,
        });
        contactId = contact.id;
        result.contactsCreated++;
      }
    }

    contactIds.add(contactId!);
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
