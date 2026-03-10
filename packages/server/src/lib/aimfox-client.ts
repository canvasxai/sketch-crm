/**
 * AimFox API v2 client — typed HTTP wrapper for LinkedIn automation.
 * Handles lead profiles, conversations, message sending, and lead search.
 */

const AIMFOX_BASE_URL = "https://api.aimfox.com/api/v2";

// ── AimFox API Types ──

export interface AimfoxAccount {
  id: string;
  urn: string;
  full_name: string;
  public_identifier: string;
  picture_url: string;
  state: string;
  disabled: boolean;
}

export interface AimfoxLeadTarget {
  urn: string;
  full_name: string;
  picture_url: string;
  occupation: string;
}

export interface AimfoxRecentLead {
  timestamp: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  target_id: string;
  target_urn: string;
  transition: string; // "accepted" | "reply"
  target: AimfoxLeadTarget;
}

export interface AimfoxLeadCompany {
  urn: string;
  name: string;
  universal_name: string;
}

export interface AimfoxLeadExperience {
  company: AimfoxLeadCompany;
  job_title: string;
  start_date: { month?: number; year?: number };
  end_date?: { month?: number; year?: number };
  location?: { name: string };
}

export interface AimfoxLead {
  id: string;
  urn: string;
  first_name: string;
  last_name: string;
  full_name: string;
  public_identifier: string;
  occupation: string;
  picture_url: string;
  location: { name: string; urn?: string } | null;
  about: string | null;
  premium: boolean;
  connections: number;
  followers: number;
  current_experience: AimfoxLeadExperience[];
  work_experience: AimfoxLeadExperience[];
  education: unknown[];
  skills: Array<{ name: string }>;
  certifications: unknown[];
  languages: Array<{ name: string; proficiency: string }>;
  contact_info: {
    phone_numbers?: Array<{ number: string; type: string }>;
    birthday?: { month: number; day: number };
  };
  phones: Array<{ number: string; type: string }>;
  emails?: Array<{ address: string; type?: string }>;
  labels: unknown[];
  notes: unknown[];
  is_lead: boolean;
  lead_of: string[];
  origins: Array<{ id: string; name: string }>;
}

export interface AimfoxSearchResult {
  status: string;
  leads: Array<{
    id: string;
    urn: string;
    full_name: string;
    public_identifier: string;
    occupation: string;
    picture_url: string;
    location?: { name: string };
  }>;
}

export interface AimfoxMessageSender {
  id: string;
  full_name: string;
  picture_url: string;
}

export interface AimfoxMessage {
  body: string;
  sender: AimfoxMessageSender;
  created_at: number; // unix ms timestamp
}

export interface AimfoxConversation {
  status: string;
  messages: AimfoxMessage[];
}

export interface AimfoxSendResult {
  status: string;
  conversation_urn?: string;
  message_urn?: string;
  created_at?: number;
}

// ── Webhook payload types ──

export interface AimfoxWebhookPayload {
  id: string;
  event_type: string; // "accepted" | "replied" etc.
  event: {
    target_urn: string;
    prev_state: string;
    state: string;
    transition: string;
    flow_id: string;
    flow_type: string;
    timestamp: string;
    account: {
      id: number;
      urn: string;
      public_identifier: string;
      first_name: string;
      last_name: string;
      email: string | null;
      picture_url: string;
    };
    target: {
      id: number;
      urn: string;
      public_identifier: string;
      first_name: string;
      last_name: string;
      email: string | null;
      picture_url: string;
    };
    campaign: {
      id: string;
      name: string;
      type: string;
      state: string;
      outreach_type: string;
    };
  };
  workspace: {
    id: string;
    name: string;
    created_at: number;
  };
}

// ── Text sanitization ──

/** Strip non-ASCII chars that cause AimFox API 500 errors. */
export function sanitizeForAimfox(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/\u2013/g, "-") // en dash
    .replace(/\u2014/g, "--") // em dash
    .replace(/\u2026/g, "...") // ellipsis
    .replace(/\u00A0/g, " "); // non-breaking space
}

// ── Client ──

export class AimfoxClient {
  constructor(
    private apiKey: string,
    private accountId: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${AIMFOX_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AimFox API error (${res.status}): ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async listAccounts(): Promise<AimfoxAccount[]> {
    const res = await this.request<{ status: string; accounts: AimfoxAccount[] }>("/accounts");
    return res.accounts;
  }

  async getLead(leadId: string): Promise<AimfoxLead> {
    const res = await this.request<{ status: string; lead: AimfoxLead }>(`/leads/${leadId}`);
    return res.lead;
  }

  async searchLeads(
    start: number,
    count: number,
    filters?: {
      keywords?: string;
      labels?: string[];
      locations?: string[];
      skills?: string[];
    },
  ): Promise<AimfoxSearchResult> {
    return this.request<AimfoxSearchResult>(`/leads:search?start=${start}&count=${count}`, {
      method: "POST",
      body: JSON.stringify({
        keywords: filters?.keywords ?? "",
        current_companies: [],
        past_companies: [],
        education: [],
        interests: [],
        labels: filters?.labels ?? [],
        languages: [],
        locations: filters?.locations ?? [],
        origins: [],
        skills: filters?.skills ?? [],
        lead_of: [],
        optimize: false,
      }),
    });
  }

  async getRecentLeads(): Promise<AimfoxRecentLead[]> {
    const res = await this.request<{ status: string; leads: AimfoxRecentLead[] }>(
      "/analytics/recent-leads",
    );
    return res.leads;
  }

  async getConversationUrn(leadId: string): Promise<string | null> {
    const res = await this.request<{ status: string; conversation_urn: string | null }>(
      `/accounts/${this.accountId}/leads/${leadId}/conversation`,
    );
    return res.conversation_urn;
  }

  async getConversation(conversationUrn: string): Promise<AimfoxConversation> {
    return this.request<AimfoxConversation>(
      `/accounts/${this.accountId}/conversations/${conversationUrn}`,
    );
  }

  async sendMessage(recipients: string[], message: string): Promise<AimfoxSendResult> {
    const sanitized = sanitizeForAimfox(message);
    return this.request<AimfoxSendResult>(`/accounts/${this.accountId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ message: sanitized, recipients }),
    });
  }
}
