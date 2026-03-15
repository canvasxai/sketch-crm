/**
 * Fireflies meeting transcript sync orchestration.
 * Fetches transcripts, matches or creates contacts from attendees, creates meetings.
 *
 * For each transcript:
 *  1. Skip internal-domain participants
 *  2. Match external emails to existing contacts, or auto-create contact + company
 *  3. Create one meeting row, link all external contacts via meeting_contacts join table
 */

import type { Config } from "../config.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createMeetingsRepository } from "../db/repositories/meetings.js";
import type { createFirefliesSyncStateRepository } from "../db/repositories/fireflies-sync-state.js";
import type { createOrgSettingsRepository } from "../db/repositories/org-settings.js";
import { createFirefliesClient } from "./fireflies-client.js";
import { findOrCreateContactByEmail, nameFromEmail } from "./contact-matcher.js";

export type SyncDateRange = { after: string; before: string };

interface FirefliesSyncDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  companies: ReturnType<typeof createCompaniesRepository>;
  meetings: ReturnType<typeof createMeetingsRepository>;
  firefliesSyncState: ReturnType<typeof createFirefliesSyncStateRepository>;
  orgSettings: ReturnType<typeof createOrgSettingsRepository>;
  config: Config;
}

interface SyncResult {
  transcriptsSynced: number;
  meetingsCreated: number;
  contactsMatched: number;
  contactsCreated: number;
  companiesCreated: number;
  errors: string[];
}

let activeController: AbortController | null = null;

export function cancelFirefliesSync(): boolean {
  if (activeController) {
    activeController.abort();
    activeController = null;
    return true;
  }
  return false;
}

export async function syncFirefliesTranscripts(
  deps: FirefliesSyncDeps,
  dateRange: SyncDateRange,
  opts?: { createdByUserId?: string },
): Promise<SyncResult> {
  const apiKey = deps.config.FIREFLIES_API_KEY;
  if (!apiKey) {
    throw new Error("FIREFLIES_API_KEY not configured");
  }

  const client = createFirefliesClient(apiKey);
  const result: SyncResult = {
    transcriptsSynced: 0,
    meetingsCreated: 0,
    contactsMatched: 0,
    contactsCreated: 0,
    companiesCreated: 0,
    errors: [],
  };

  activeController = new AbortController();
  const signal = activeController.signal;

  try {
    await deps.firefliesSyncState.updateStatus("syncing");

    // Get internal domains to identify internal participants
    const internalDomains = await deps.orgSettings.getInternalDomains();

    // Paginate through transcripts
    let skip = 0;
    const limit = 50;

    while (!signal.aborted) {
      const transcripts = await client.listTranscripts({
        fromDate: dateRange.after,
        toDate: dateRange.before,
        limit,
        skip,
      });

      if (transcripts.length === 0) break;

      for (const transcript of transcripts) {
        if (signal.aborted) break;

        try {
          // Dedup — one meeting per transcript
          const existing = await deps.meetings.findByFirefliesTranscriptId(transcript.id);
          if (existing) {
            result.transcriptsSynced++;
            await deps.firefliesSyncState.incrementCounters({ transcripts: 1 });
            continue;
          }

          // Fetch full summary (may be null for short/unprocessed meetings)
          const summary = await client.getTranscriptSummary(transcript.id);

          // Use participant emails from summary if available, fall back to list data
          const allEmails = summary?.participantEmails ?? transcript.participantEmails;

          // Filter to external participant emails
          const externalEmails = allEmails.filter((email) => {
            const domain = email.split("@")[1];
            return !internalDomains.some((d) => domain === d.toLowerCase());
          });

          // Skip transcripts with no external participants
          if (externalEmails.length === 0) {
            result.transcriptsSynced++;
            await deps.firefliesSyncState.incrementCounters({ transcripts: 1 });
            continue;
          }

          // Find or create contacts for all external attendees
          const contactIds: string[] = [];
          for (const email of externalEmails) {
            const match = await findOrCreateContactByEmail(
              email,
              nameFromEmail(email),
              "fireflies",
              { contacts: deps.contacts, companies: deps.companies },
              { createdByUserId: opts?.createdByUserId },
            );
            if (match.created) result.contactsCreated++;
            if (match.companyCreated) result.companiesCreated++;
            if (!contactIds.includes(match.contactId)) {
              contactIds.push(match.contactId);
            }
          }

          result.contactsMatched += contactIds.length;

          // Create ONE meeting, primary contact = first match
          const meeting = await deps.meetings.create({
            contactId: contactIds[0],
            title: transcript.title,
            startTime: transcript.date,
            attendees: JSON.stringify(externalEmails),
            firefliesTranscriptId: transcript.id,
            aiSummary: summary?.overview ?? undefined,
            actionItems: summary?.actionItems ?? [],
            keywords: summary?.keywords ?? [],
            durationMinutes: Math.round(transcript.durationMinutes),
            source: "fireflies",
          });

          // Link ALL contacts via join table
          await deps.meetings.linkContacts(meeting.id, contactIds);

          result.meetingsCreated++;
          result.transcriptsSynced++;

          // Update counters incrementally so UI shows progress
          await deps.firefliesSyncState.incrementCounters({
            transcripts: 1,
            meetings: 1,
            contacts: contactIds.length,
          });

          // Flag contacts for re-classification
          await deps.contacts.setNeedsClassification(contactIds);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Transcript ${transcript.id}: ${errMsg}`);
        }
      }

      if (transcripts.length < limit) break;
      skip += limit;
    }

    // Track oldest/newest transcript dates (expand window, never shrink)
    const state = await deps.firefliesSyncState.get();
    const dateUpdate: { oldestTranscriptAt?: string | null; newestTranscriptAt?: string | null } = {};
    const afterMs = new Date(dateRange.after).getTime();
    const beforeMs = new Date(dateRange.before).getTime();
    if (!state?.oldest_transcript_at || afterMs < new Date(state.oldest_transcript_at).getTime()) {
      dateUpdate.oldestTranscriptAt = dateRange.after;
    }
    if (!state?.newest_transcript_at || beforeMs > new Date(state.newest_transcript_at).getTime()) {
      dateUpdate.newestTranscriptAt = dateRange.before;
    }

    // Update sync state
    await deps.firefliesSyncState.upsert({
      status: "idle",
      lastSyncAt: new Date().toISOString(),
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
      ...dateUpdate,
    });
    // Counters already updated incrementally per transcript
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await deps.firefliesSyncState.updateStatus("error", errMsg);
    result.errors.push(errMsg);
  } finally {
    activeController = null;
  }

  return result;
}
