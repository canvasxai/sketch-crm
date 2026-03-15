/**
 * Fireflies.ai GraphQL client for fetching meeting transcripts.
 *
 * Quirks handled:
 *  - `date` is a Unix timestamp in ms, not ISO — we convert to ISO string
 *  - `participants` array can contain a comma-separated string as first element — we split + deduplicate
 *  - `duration` is in minutes (not seconds)
 *  - `summary` can be null for short or unprocessed meetings
 *  - `meeting_attendees` provides structured email/name data
 */

const ENDPOINT = "https://api.fireflies.ai/graphql";

export interface TranscriptListItem {
  id: string;
  title: string;
  date: string; // ISO string (converted from ms timestamp)
  durationMinutes: number;
  participantEmails: string[]; // deduplicated email list
  organizerEmail: string | null;
}

export interface TranscriptSummary {
  id: string;
  title: string;
  date: string; // ISO string
  durationMinutes: number;
  participantEmails: string[];
  organizerEmail: string | null;
  overview: string | null;
  actionItems: string[];
  keywords: string[];
}

export interface FirefliesClient {
  listTranscripts(opts: {
    fromDate?: string;
    toDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<TranscriptListItem[]>;
  getTranscriptSummary(id: string): Promise<TranscriptSummary | null>;
}

/** Parse the raw participants array — first element may be comma-separated */
function parseParticipants(raw: string[]): string[] {
  const emails = new Set<string>();
  for (const entry of raw) {
    // Split on commas (first entry is often all emails joined)
    for (const part of entry.split(",")) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed && trimmed.includes("@")) {
        emails.add(trimmed);
      }
    }
  }
  return [...emails];
}

/** Convert Fireflies ms timestamp to ISO string */
function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

interface RawTranscript {
  id: string;
  title: string;
  date: number; // ms timestamp
  duration: number; // minutes
  participants: string[];
  organizer_email: string | null;
  meeting_attendees?: Array<{ email: string | null; displayName: string | null; name: string | null }>;
  summary?: {
    overview: string | null;
    action_items: string[] | null;
    keywords: string[] | null;
  } | null;
}

export function createFirefliesClient(apiKey: string): FirefliesClient {
  async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Fireflies API error (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Fireflies GraphQL error: ${json.errors[0].message}`);
    }
    return json.data as T;
  }

  function normalizeTranscript(raw: RawTranscript): TranscriptListItem {
    // Merge participants + meeting_attendees emails
    const emails = parseParticipants(raw.participants);
    if (raw.meeting_attendees) {
      for (const a of raw.meeting_attendees) {
        if (a.email) {
          const e = a.email.trim().toLowerCase();
          if (e.includes("@") && !emails.includes(e)) {
            emails.push(e);
          }
        }
      }
    }

    return {
      id: raw.id,
      title: raw.title,
      date: msToIso(raw.date),
      durationMinutes: raw.duration,
      participantEmails: emails,
      organizerEmail: raw.organizer_email,
    };
  }

  return {
    async listTranscripts({ fromDate, toDate, limit = 50, skip = 0 }) {
      const data = await gql<{ transcripts: RawTranscript[] }>(
        `query ListTranscripts($limit: Int, $skip: Int, $fromDate: DateTime, $toDate: DateTime) {
          transcripts(limit: $limit, skip: $skip, fromDate: $fromDate, toDate: $toDate) {
            id
            title
            date
            duration
            participants
            organizer_email
            meeting_attendees {
              email
              displayName
              name
            }
          }
        }`,
        { limit, skip, fromDate, toDate },
      );
      return (data.transcripts ?? []).map(normalizeTranscript);
    },

    async getTranscriptSummary(id: string) {
      const data = await gql<{ transcript: RawTranscript | null }>(
        `query GetTranscript($id: String!) {
          transcript(id: $id) {
            id
            title
            date
            duration
            participants
            organizer_email
            meeting_attendees {
              email
              displayName
              name
            }
            summary {
              overview
              action_items
              keywords
            }
          }
        }`,
        { id },
      );

      const raw = data.transcript;
      if (!raw) return null;

      const base = normalizeTranscript(raw);
      return {
        ...base,
        overview: raw.summary?.overview ?? null,
        actionItems: raw.summary?.action_items ?? [],
        keywords: raw.summary?.keywords ?? [],
      };
    },
  };
}
