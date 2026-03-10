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
 * Extract company info from AimFox lead profile and find/create in CRM.
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

  // Try to find by LinkedIn URL first (most reliable)
  if (linkedinUrl) {
    const existing = await companies.search(currentExp.company.universal_name, 1);
    if (existing.length > 0) return existing[0].id;
  }

  // Try to find by name
  const byName = await companies.search(companyName, 1);
  if (byName.length > 0 && byName[0].name.toLowerCase() === companyName.toLowerCase()) {
    return byName[0].id;
  }

  // Create new company
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
    // Create new contact
    contact = await deps.contacts.create({
      name: contactName,
      email: target.email ?? richProfile?.emails?.[0]?.address ?? undefined,
      linkedinUrl,
      companyId: companyId ?? undefined,
      source: "linkedin",
      funnelStage: "new",
      leadChannel: "outbound_linkedin",
      title: title ?? undefined,
      visibility: "shared",
      aimfoxLeadId,
      aimfoxProfileData: richProfile ?? undefined,
    });

    await deps.aimfoxSyncState.incrementCounters({ contacts: 1 });
    if (companyId) {
      await deps.aimfoxSyncState.incrementCounters({ companies: 1 });
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
export async function backfillAimfoxLeads(
  deps: SyncDeps,
  options?: { batchSize?: number; syncConversations?: boolean; maxLeads?: number },
): Promise<{ processed: number; contactsCreated: number; companiesCreated: number }> {
  if (!deps.config.AIMFOX_API_KEY) {
    throw new Error("AIMFOX_API_KEY not configured");
  }

  const client = new AimfoxClient(deps.config.AIMFOX_API_KEY, deps.config.AIMFOX_ACCOUNT_ID);
  const batchSize = options?.batchSize ?? 20;
  const maxLeads = options?.maxLeads ?? Infinity;

  await deps.aimfoxSyncState.updateStatus("syncing");

  // Resume from last cursor
  const syncState = await deps.aimfoxSyncState.get();
  let cursor = syncState?.last_backfill_cursor ?? 0;
  let processed = 0;
  let contactsCreated = 0;
  let companiesCreated = 0;

  try {
    while (processed < maxLeads) {
      const result = await client.searchLeads(cursor, batchSize);
      if (!result.leads || result.leads.length === 0) break;

      for (const lead of result.leads) {
        if (processed >= maxLeads) break;

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
              funnelStage: "new",
              leadChannel: "outbound_linkedin",
              title: richProfile.current_experience?.[0]?.job_title ?? undefined,
              visibility: "shared",
              aimfoxLeadId: lead.id,
              aimfoxProfileData: richProfile,
            });
            contactsCreated++;
          } else {
            // Update existing with profile data if missing
            if (!contact.aimfox_profile_data) {
              await deps.contacts.update(contact.id, {
                aimfoxProfileData: richProfile,
                aimfoxLeadId: lead.id,
              });
            }
          }

          // Optionally sync conversation
          if (options?.syncConversations && contact) {
            try {
              await syncConversation(contact.id, lead.id, deps);
            } catch {
              // Conversation sync failure is non-fatal
            }
          }

          processed++;
        } catch (err) {
          console.warn(`[aimfox-backfill] Error processing lead ${lead.id}:`, err);
          processed++;
        }

        // Rate limit protection
        await new Promise((r) => setTimeout(r, 500));
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
  }

  console.log(
    `[aimfox-backfill] Done: ${processed} processed, ${contactsCreated} contacts, ${companiesCreated} companies`,
  );

  return { processed, contactsCreated, companiesCreated };
}
