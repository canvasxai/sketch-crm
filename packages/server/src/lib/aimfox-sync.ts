/**
 * AimFox sync logic — processes webhook events and syncs LinkedIn data into CRM.
 * Handles connection accepts, conversation sync, and bulk backfill.
 */
import type { createAimfoxSyncStateRepository } from "../db/repositories/aimfox-sync-state.js";
import type { createAimfoxWebhookLogRepository } from "../db/repositories/aimfox-webhook-log.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { Config } from "../config.js";
import { AimfoxClient, type AimfoxLead, type AimfoxWebhookPayload } from "./aimfox-client.js";

interface SyncDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  linkedinMessages: ReturnType<typeof createLinkedinMessagesRepository>;
  aimfoxSyncState: ReturnType<typeof createAimfoxSyncStateRepository>;
  aimfoxWebhookLog: ReturnType<typeof createAimfoxWebhookLogRepository>;
  config: Config;
}

/**
 * Build a LinkedIn profile URL from a public identifier.
 */
function buildLinkedinUrl(publicIdentifier: string): string {
  return `https://www.linkedin.com/in/${publicIdentifier}`;
}

/**
 * Strip common corporate suffixes from a company name for fuzzy matching.
 */
function normalizeCompanyName(name: string): string {
  return name
    .replace(/\b(Inc\.?|Corp\.?|LLC|Ltd\.?|Co\.?|Group|Holdings|PLC|GmbH|S\.?A\.?|AG)\b/gi, "")
    .replace(/[.,]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Guess the most likely domain from a company name.
 * e.g. "Acme Corp" → "acme.com", "My Company Inc." → "mycompany.com"
 */
function guessCompanyDomain(name: string): string {
  return normalizeCompanyName(name).replace(/\s+/g, "") + ".com";
}

/**
 * Extract company info from AimFox lead profile and find/create in CRM.
 * Uses a multi-step resolution strategy to bridge LinkedIn company names
 * to existing companies that may have been created from email domains.
 */
async function resolveCompany(
  lead: AimfoxLead,
  companies: SyncDeps["companies"],
): Promise<string | null> {
  const currentExp = lead.current_experience?.[0];
  if (!currentExp?.company?.name) return null;

  const companyName = currentExp.company.name;
  const linkedinUrl = currentExp.company.universal_name
    ? `https://www.linkedin.com/company/${currentExp.company.universal_name}`
    : null;

  // Step 1: Try to find by LinkedIn universal_name (most reliable)
  if (linkedinUrl) {
    const existing = await companies.search(currentExp.company.universal_name, 1);
    if (existing.length > 0) return existing[0].id;
  }

  // Step 2: Try exact name match
  const byName = await companies.search(companyName, 1);
  if (byName.length > 0 && byName[0].name.toLowerCase() === companyName.toLowerCase()) {
    // Fill in LinkedIn URL on the existing company if missing
    if (linkedinUrl && !byName[0].linkedin_url) {
      await companies.update(byName[0].id, { linkedinUrl });
    }
    return byName[0].id;
  }

  // Step 3: Try normalized name match (strip "Inc.", "Corp.", etc.)
  const normalized = normalizeCompanyName(companyName);
  if (normalized) {
    const byNormalized = await companies.search(normalized, 5);
    for (const candidate of byNormalized) {
      if (normalizeCompanyName(candidate.name) === normalized) {
        if (linkedinUrl && !candidate.linkedin_url) {
          await companies.update(candidate.id, { linkedinUrl });
        }
        return candidate.id;
      }
    }
  }

  // Step 4: Try domain-based matching — guess domain from LinkedIn company name
  // This bridges "Acme Corp" (LinkedIn) → "acme.com" (from email ingestion)
  const guessedDomain = guessCompanyDomain(companyName);
  if (guessedDomain) {
    const byDomain = await companies.findByDomain(guessedDomain);
    if (byDomain) {
      if (linkedinUrl && !byDomain.linkedin_url) {
        await companies.update(byDomain.id, { linkedinUrl });
      }
      return byDomain.id;
    }
  }

  // Step 5: No match — create new company
  const created = await companies.create({
    name: companyName,
    linkedinUrl: linkedinUrl ?? undefined,
    source: "linkedin",
    location: currentExp.location?.name,
  });
  return created.id;
}

/**
 * Process an AimFox "accepted" or "replied" webhook event.
 * Creates/updates contact + company, records timeline event.
 */
export async function processConnectionAccept(
  payload: AimfoxWebhookPayload,
  deps: SyncDeps,
) {
  const { event } = payload;
  const target = event.target;
  const linkedinUrl = buildLinkedinUrl(target.public_identifier);
  const aimfoxLeadId = String(target.id);

  // 1. Dedup — check by linkedin_url, then by aimfox_lead_id
  let contact = await deps.contacts.findByLinkedinUrl(linkedinUrl);
  if (!contact) {
    contact = await deps.contacts.findByAimfoxLeadId(aimfoxLeadId);
  }

  // 2. Fetch rich profile from AimFox API for title, company, skills, etc.
  let richProfile: AimfoxLead | null = null;
  if (deps.config.AIMFOX_API_KEY) {
    try {
      const client = new AimfoxClient(deps.config.AIMFOX_API_KEY, deps.config.AIMFOX_ACCOUNT_ID);
      richProfile = await client.getLead(aimfoxLeadId);
    } catch (err) {
      console.warn(`[aimfox-sync] Failed to fetch rich profile for lead ${aimfoxLeadId}:`, err);
    }
  }

  // 3. Resolve company from profile data
  let companyId: string | null = null;
  if (richProfile) {
    try {
      companyId = await resolveCompany(richProfile, deps.companies);
    } catch (err) {
      console.warn(`[aimfox-sync] Failed to resolve company for lead ${aimfoxLeadId}:`, err);
    }
  }

  // 4. Create or update contact
  const contactName = `${target.first_name} ${target.last_name}`.trim();
  const title = richProfile?.current_experience?.[0]?.job_title ?? null;

  if (!contact) {
    // Tier 1: Try email match if we have an email
    const contactEmail = target.email ?? richProfile?.emails?.[0]?.address ?? undefined;
    if (contactEmail) {
      const emailMatch = await deps.contacts.findDuplicate({ email: contactEmail });
      if (emailMatch) contact = emailMatch.contact;
    }

    // Tier 2: Try name + company domain match
    if (!contact && companyId) {
      const company = await deps.companies.findById(companyId);
      if (company?.domain) {
        const tier2Match = await deps.contacts.findDuplicate({
          name: contactName,
          companyDomain: company.domain,
        });
        if (tier2Match) contact = tier2Match.contact;
      }
    }
  }

  if (!contact) {
    // No match found — create new contact
    contact = await deps.contacts.create({
      name: contactName,
      email: target.email ?? richProfile?.emails?.[0]?.address ?? undefined,
      linkedinUrl,
      companyId: companyId ?? undefined,
      source: "linkedin",
      leadChannel: "outbound_linkedin",
      title: title ?? undefined,
      visibility: "unreviewed",
      aimfoxLeadId,
      aimfoxProfileData: richProfile ?? undefined,
    });

    await deps.aimfoxSyncState.incrementCounters({ contacts: 1 });
    if (companyId) {
      await deps.aimfoxSyncState.incrementCounters({ companies: 1 });

      // Inherit company category if already classified
      const company = await deps.companies.findById(companyId);
      if (company?.category && company.category !== "uncategorized") {
        await deps.contacts.updateClassification(contact.id, {
          category: company.category,
        });
      }
    }
  } else {
    // Update existing contact with enriched data
    const updates: Parameters<typeof deps.contacts.update>[1] = {};

    if (!contact.linkedin_url) updates.linkedinUrl = linkedinUrl;
    if (!contact.aimfox_lead_id) updates.aimfoxLeadId = aimfoxLeadId;
    if (!contact.title && title) updates.title = title;
    if (!contact.company_id && companyId) updates.companyId = companyId;
    if (richProfile && !contact.aimfox_profile_data) {
      updates.aimfoxProfileData = richProfile;
    }

    if (Object.keys(updates).length > 0) {
      contact = await deps.contacts.update(contact.id, updates);
      // Flag for re-classification since new data was merged
      await deps.contacts.setNeedsClassification([contact.id]);
    }
  }

  // 5. Record timeline event — "connection accepted" or "replied"
  const eventTimestamp = event.timestamp || new Date().toISOString();
  const isReply = payload.event_type === "replied";

  await deps.linkedinMessages.create({
    contactId: contact.id,
    connectionStatus: isReply ? "replied" : "accepted",
    direction: "inbound",
    sentAt: eventTimestamp,
    source: "aimfox",
    aimfoxMessageId: `webhook_${payload.id}`, // Dedup key from webhook ID
  });

  // 6. Update sync state
  await deps.aimfoxSyncState.upsert({
    lastWebhookAt: new Date().toISOString(),
    status: "idle",
  });
  await deps.aimfoxSyncState.incrementCounters({ leads: 1 });

  console.log(
    `[aimfox-sync] Processed ${payload.event_type} for ${contactName} (${linkedinUrl})`,
  );

  return contact;
}

/**
 * Sync a contact's LinkedIn conversation from AimFox.
 * Fetches all messages and bulk-inserts with dedup.
 */
export async function syncConversation(
  contactId: string,
  aimfoxLeadId: string,
  deps: SyncDeps,
): Promise<{ synced: number }> {
  if (!deps.config.AIMFOX_API_KEY) {
    throw new Error("AIMFOX_API_KEY not configured");
  }

  const client = new AimfoxClient(deps.config.AIMFOX_API_KEY, deps.config.AIMFOX_ACCOUNT_ID);

  // Get conversation URN for this lead
  const conversationUrn = await client.getConversationUrn(aimfoxLeadId);
  if (!conversationUrn) {
    return { synced: 0 };
  }

  // Fetch all messages
  const conversation = await client.getConversation(conversationUrn);
  if (!conversation.messages || conversation.messages.length === 0) {
    return { synced: 0 };
  }

  // Map to linkedin_messages format
  const messages = conversation.messages.map((msg) => {
    // Determine direction: if sender matches our account, it's outbound
    const isOutbound = msg.sender.id === deps.config.AIMFOX_ACCOUNT_ID;
    return {
      contactId,
      messageText: msg.body,
      conversationId: conversationUrn,
      aimfoxMessageId: `${conversationUrn}_${msg.created_at}`, // Dedup key
      direction: isOutbound ? "outbound" : ("inbound" as string),
      sentAt: new Date(msg.created_at).toISOString(),
      source: "aimfox" as string,
    };
  });

  const inserted = await deps.linkedinMessages.bulkCreate(messages);

  await deps.aimfoxSyncState.incrementCounters({ messages: inserted.length });

  return { synced: inserted.length };
}

/**
 * Bulk backfill leads from AimFox into CRM.
 * Paginates through all leads, creates contacts/companies, optionally syncs conversations.
 */
// Module-level AbortController so cancel endpoints can signal the running backfill
let activeBackfillController: AbortController | null = null;

/** Cancel any in-progress backfill. Returns true if one was running. */
export function cancelAimfoxBackfill(): boolean {
  if (activeBackfillController) {
    activeBackfillController.abort();
    activeBackfillController = null;
    return true;
  }
  return false;
}

export async function backfillAimfoxLeads(
  deps: SyncDeps,
  options?: { batchSize?: number; syncConversations?: boolean; maxLeads?: number; ownerId?: string },
): Promise<{ processed: number; contactsCreated: number; companiesCreated: number }> {
  if (!deps.config.AIMFOX_API_KEY) {
    throw new Error("AIMFOX_API_KEY not configured");
  }

  const client = new AimfoxClient(deps.config.AIMFOX_API_KEY, deps.config.AIMFOX_ACCOUNT_ID);
  const batchSize = options?.batchSize ?? 20;
  const maxLeads = options?.maxLeads ?? Infinity;

  // Set up abort controller for cancellation
  activeBackfillController = new AbortController();
  const signal = activeBackfillController.signal;

  await deps.aimfoxSyncState.updateStatus("syncing");

  // Resume from last cursor
  const syncState = await deps.aimfoxSyncState.get();
  let cursor = syncState?.last_backfill_cursor ?? 0;
  let processed = 0;
  let contactsCreated = 0;
  let companiesCreated = 0;

  try {
    while (processed < maxLeads) {
      // Check for cancellation at the start of each batch
      if (signal.aborted) {
        console.log(`[aimfox-backfill] Cancelled after ${processed} leads`);
        break;
      }

      const result = await client.searchLeads(cursor, batchSize);
      if (!result.leads || result.leads.length === 0) break;

      for (const lead of result.leads) {
        if (processed >= maxLeads) break;
        if (signal.aborted) break;

        try {
          // Fetch rich profile
          const richProfile = await client.getLead(lead.id);

          const linkedinUrl = buildLinkedinUrl(lead.public_identifier);

          // Dedup
          let contact = await deps.contacts.findByLinkedinUrl(linkedinUrl);
          if (!contact) {
            contact = await deps.contacts.findByAimfoxLeadId(lead.id);
          }

          if (!contact) {
            // Resolve company
            let companyId: string | null = null;
            try {
              companyId = await resolveCompany(richProfile, deps.companies);
              if (companyId) companiesCreated++;
            } catch {
              // Company resolution failure is non-fatal
            }

            contact = await deps.contacts.create({
              name: richProfile.full_name,
              email: richProfile.emails?.[0]?.address,
              linkedinUrl,
              companyId: companyId ?? undefined,
              source: "linkedin",
              leadChannel: "outbound_linkedin",
              title: richProfile.current_experience?.[0]?.job_title ?? undefined,
              visibility: "unreviewed",
              aimfoxLeadId: lead.id,
              aimfoxProfileData: richProfile,
            });
            contactsCreated++;

            // Inherit company category if already classified
            if (companyId) {
              const company = await deps.companies.findById(companyId);
              if (company?.category && company.category !== "uncategorized") {
                await deps.contacts.updateClassification(contact.id, {
                  category: company.category,
                });
              }
            }

            // Assign the triggering user as owner
            if (options?.ownerId) {
              await deps.contacts.addOwner(contact.id, options.ownerId);
            }
          } else {
            // Update existing with profile data if missing
            if (!contact.aimfox_profile_data) {
              await deps.contacts.update(contact.id, {
                aimfoxProfileData: richProfile,
                aimfoxLeadId: lead.id,
              });
              await deps.contacts.setNeedsClassification([contact.id]);
            }
          }

          // Always sync conversation — messages are essential for classification
          if (contact) {
            try {
              const convResult = await syncConversation(contact.id, lead.id, deps);
              // If no messages were synced, clear needs_classification — AI has nothing to work with
              if (convResult.synced === 0) {
                await deps.contacts.updateClassification(contact.id, {
                  category: "uncategorized",
                });
              }
            } catch {
              // Conversation sync failure is non-fatal
            }
          }

          processed++;
        } catch (err) {
          console.warn(`[aimfox-backfill] Error processing lead ${lead.id}:`, err);
          processed++;
        }

        // Rate limit protection (AimFox API calls already provide natural throttling)
        await new Promise((r) => setTimeout(r, 100));
      }

      cursor += result.leads.length;
      await deps.aimfoxSyncState.upsert({ lastBackfillCursor: cursor });
    }

    await deps.aimfoxSyncState.upsert({
      status: "idle",
      lastSyncAt: new Date().toISOString(),
    });
    await deps.aimfoxSyncState.incrementCounters({
      leads: processed,
      contacts: contactsCreated,
      companies: companiesCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await deps.aimfoxSyncState.updateStatus("error", message);
    throw err;
  } finally {
    activeBackfillController = null;
  }

  console.log(
    `[aimfox-backfill] Done: ${processed} processed, ${contactsCreated} contacts, ${companiesCreated} companies`,
  );

  return { processed, contactsCreated, companiesCreated };
}
