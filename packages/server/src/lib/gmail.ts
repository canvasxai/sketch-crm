/**
 * Gmail API client — wraps REST calls to Gmail API v1.
 * Uses raw fetch() for minimal dependencies.
 */

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: GmailMessageHeader[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: {
    headers: GmailMessageHeader[];
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
    mimeType?: string;
  };
  internalDate: string;
}

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export class GmailClient {
  constructor(private accessToken: string) {}

  async listMessages(opts: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<GmailListResponse> {
    const params = new URLSearchParams();
    if (opts.query) params.set("q", opts.query);
    if (opts.maxResults) params.set("maxResults", String(opts.maxResults));
    if (opts.pageToken) params.set("pageToken", opts.pageToken);

    const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 401) throw new Error("GMAIL_TOKEN_EXPIRED");
    if (!res.ok)
      throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);

    return res.json() as Promise<GmailListResponse>;
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    const res = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    );

    if (res.status === 401) throw new Error("GMAIL_TOKEN_EXPIRED");
    if (!res.ok)
      throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);

    return res.json() as Promise<GmailMessage>;
  }

  async getProfile(): Promise<{ emailAddress: string }> {
    const res = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 401) throw new Error("GMAIL_TOKEN_EXPIRED");
    if (!res.ok)
      throw new Error(
        `Gmail profile error: ${res.status} ${await res.text()}`,
      );

    return res.json() as Promise<{ emailAddress: string }>;
  }
}

// ── Helpers ──

/**
 * Extracts a header value from a Gmail message.
 */
export function getHeader(
  message: GmailMessage,
  name: string,
): string | undefined {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

/**
 * Decodes base64url-encoded Gmail body data to a UTF-8 string.
 */
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Extracts both plain text and HTML body from a Gmail message.
 * Plain text: prefers text/plain, falls back to stripped HTML.
 * HTML: returns text/html part if available.
 */
export function extractBody(message: GmailMessage): { plain: string; html: string | null } {
  function findPart(
    parts: GmailMessagePart[] | undefined,
    mimeType: string,
  ): string | null {
    if (!parts) return null;
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      const nested = findPart(part.parts, mimeType);
      if (nested) return nested;
    }
    return null;
  }

  // Simple message (no parts)
  if (message.payload.mimeType === "text/plain" && message.payload.body?.data) {
    return { plain: decodeBase64Url(message.payload.body.data), html: null };
  }
  if (message.payload.mimeType === "text/html" && message.payload.body?.data) {
    const rawHtml = decodeBase64Url(message.payload.body.data);
    return { plain: stripHtml(rawHtml), html: rawHtml };
  }

  // Multipart message
  const plain = findPart(message.payload.parts, "text/plain");
  const html = findPart(message.payload.parts, "text/html");

  if (plain) {
    return { plain, html: html ?? null };
  }
  if (html) {
    return { plain: stripHtml(html), html };
  }

  return { plain: "", html: null };
}

/** Strip HTML to plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts email address from a "Name <email>" format header.
 */
export function parseEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return (match ? match[1] : header).trim().toLowerCase();
}

/**
 * Extracts all email addresses from From, To, Cc headers.
 */
export function extractAllParticipants(
  message: GmailMessage,
): Set<string> {
  const participants = new Set<string>();
  for (const headerName of ["From", "To", "Cc"]) {
    const value = getHeader(message, headerName);
    if (!value) continue;
    // Split by comma, handle "Name <email>, Name2 <email2>" format
    for (const part of value.split(",")) {
      const email = parseEmailAddress(part);
      if (email.includes("@")) {
        participants.add(email);
      }
    }
  }
  return participants;
}
