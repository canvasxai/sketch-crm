import type {
  Company,
  CompanySource,
  Contact,
  ContactEmailEntry,
  ContactPhoneEntry,
  ContactSource,
  DedupLogEntry,
  Email,
  FunnelStage,
  LeadChannel,
  Meeting,
  Note,
  Task,
  TimelineEntry,
  User,
  UserRole,
} from "@crm/shared";
import { request } from "./api-client";

// ── Response types ──

interface SessionResponse {
  authenticated: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: UserRole;
  };
}

interface LogoutResponse {
  success: true;
}

interface CompanyListResponse {
  companies: Company[];
  total: number;
}

interface CompanyDetailResponse {
  company: Company & { owners: User[] };
}

interface CompanyMatchResponse {
  company: Company | null;
}

interface CompanyCreateResponse {
  company: Company;
}

interface CompanyUpdateResponse {
  company: Company;
}

interface CompanyDeleteResponse {
  success: true;
}

interface OwnerResponse {
  success: true;
}

interface ContactListResponse {
  contacts: Contact[];
  total: number;
}

interface ContactCountsResponse {
  sourceCounts: Record<string, number>;
  visibilityCounts: Record<string, number>;
  total: number;
}

interface BatchUpdateResponse {
  updated: number;
}

interface BatchDeleteResponse {
  deleted: number;
}

interface InternalDomainsResponse {
  domains: string[];
}

interface VendorDomain {
  id: string;
  domain: string;
  source: string;
  created_at: string;
}

interface VendorDomainsResponse {
  domains: VendorDomain[];
}

interface VendorDomainCreateResponse {
  domain: VendorDomain;
  purged: { contactsRemoved: number; companiesRemoved: number };
}

interface ContactDetailResponse {
  contact: Contact & { owners: User[] };
}

interface ContactCreateResponse {
  contact: Contact;
}

interface ContactUpdateResponse {
  contact: Contact;
}

interface ContactDeleteResponse {
  success: true;
}

interface TimelineResponse {
  timeline: TimelineEntry[];
  total: number;
}

interface TaskListResponse {
  tasks: Task[];
}

interface TaskResponse {
  task: Task;
}

interface MeetingResponse {
  meeting: Meeting;
}

interface NextUpItem {
  type: "meeting" | "task" | "reply_needed" | "none";
  label: string;
  dueDate?: string;
  isOverdue?: boolean;
  contactName?: string;
}

interface LastTouchedItem {
  action: "email" | "meeting" | "linkedin_message";
  label: string;
  date: string;
}

interface EmailListResponse {
  emails: Email[];
}

interface NoteCreateResponse {
  note: Note;
}

interface UserListResponse {
  users: User[];
}

interface GmailSyncState {
  lastSyncAt: string | null;
  status: string;
  errorMessage: string | null;
  emailsSynced: number;
  contactsCreated: number;
  companiesCreated: number;
}

interface GmailStatusResponse {
  hasToken: boolean;
  syncState: GmailSyncState | null;
}

interface GmailSyncResponse {
  result: {
    emailsSynced: number;
    contactsCreated: number;
    companiesCreated: number;
    errors: string[];
  };
}

interface ClassificationChange {
  contactId: string;
  name: string;
  oldStage: string;
  newStage: string;
}

interface ClassificationResponse {
  result: {
    totalContacts: number;
    classified: number;
    changed: number;
    errors: number;
    changes: ClassificationChange[];
  };
}

interface SourceStatusResponse {
  gmail: {
    connected: boolean;
    lastSyncAt: string | null;
    status: string;
    errorMessage: string | null;
    emailsSynced: number;
    contactsCreated: number;
    companiesCreated: number;
    syncFrequency: string;
    syncPeriod: string;
  };
  linkedin: {
    connected: boolean;
    lastLeadAt: string | null;
    status: string;
    lastSyncAt: string | null;
    errorMessage: string | null;
    leadsSynced: number;
    contactsCreated: number;
    companiesCreated: number;
  };
  canvas_signup: {
    connected: boolean;
    lastLeadAt: string | null;
  };
  google_calendar: {
    connected: boolean;
    lastSyncAt: string | null;
    lastLeadAt: string | null;
    status: string;
    errorMessage: string | null;
    eventsSynced: number;
    contactsCreated: number;
    meetingsCreated: number;
    syncFrequency: string;
    syncPeriod: string;
  };
}

interface IngestionResult {
  contactsCreated: number;
  contactsUpdated: number;
  contactsSkipped: number;
  companiesCreated: number;
  activitiesCreated: number;
  errors: string[];
}

interface IngestionResponse {
  result: IngestionResult;
}

// ── Helpers ──

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

// ── API client ──

export const api = {
  auth: {
    session(): Promise<SessionResponse> {
      return request<SessionResponse>("/api/auth/session");
    },
    logout(): Promise<LogoutResponse> {
      return request<LogoutResponse>("/api/auth/logout", { method: "POST" });
    },
  },

  companies: {
    list(params?: {
      search?: string;
      limit?: number;
      offset?: number;
    }): Promise<CompanyListResponse> {
      const query = buildQuery(params ?? {});
      return request<CompanyListResponse>(`/api/companies${query}`);
    },

    get(id: string): Promise<CompanyDetailResponse> {
      return request<CompanyDetailResponse>(`/api/companies/${id}`);
    },

    match(domain: string): Promise<CompanyMatchResponse> {
      const query = buildQuery({ domain });
      return request<CompanyMatchResponse>(`/api/companies/match${query}`);
    },

    create(body: {
      name: string;
      domain?: string;
      industry?: string;
      size?: string;
      location?: string;
      websiteUrl?: string;
      linkedinUrl?: string;
      source?: CompanySource;
      description?: string;
      techStack?: string;
      fundingStage?: string;
    }): Promise<CompanyCreateResponse> {
      return request<CompanyCreateResponse>("/api/companies", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    update(
      id: string,
      body: Partial<{
        name: string;
        domain: string;
        industry: string;
        size: string;
        location: string;
        websiteUrl: string;
        linkedinUrl: string;
        source: CompanySource;
        description: string;
        techStack: string;
        fundingStage: string;
      }>,
    ): Promise<CompanyUpdateResponse> {
      return request<CompanyUpdateResponse>(`/api/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete(id: string): Promise<CompanyDeleteResponse> {
      return request<CompanyDeleteResponse>(`/api/companies/${id}`, {
        method: "DELETE",
      });
    },

    addOwner(companyId: string, userId: string): Promise<OwnerResponse> {
      return request<OwnerResponse>(`/api/companies/${companyId}/owners/${userId}`, {
        method: "POST",
      });
    },

    removeOwner(companyId: string, userId: string): Promise<OwnerResponse> {
      return request<OwnerResponse>(`/api/companies/${companyId}/owners/${userId}`, {
        method: "DELETE",
      });
    },
  },

  contacts: {
    list(params?: {
      funnelStage?: FunnelStage;
      source?: ContactSource;
      visibility?: string;
      companyId?: string;
      ownerId?: string;
      isCanvasUser?: boolean;
      isSketchUser?: boolean;
      usesServices?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    }): Promise<ContactListResponse> {
      const query = buildQuery(params ?? {});
      return request<ContactListResponse>(`/api/contacts${query}`);
    },

    counts(): Promise<ContactCountsResponse> {
      return request<ContactCountsResponse>("/api/contacts/counts");
    },

    get(id: string): Promise<ContactDetailResponse> {
      return request<ContactDetailResponse>(`/api/contacts/${id}`);
    },

    create(body: {
      name: string;
      email?: string;
      phone?: string;
      title?: string;
      linkedinUrl?: string;
      companyId?: string;
      source: ContactSource;
      funnelStage?: FunnelStage;
      isCanvasUser?: boolean;
      isSketchUser?: boolean;
      usesServices?: boolean;
      canvasSignupDate?: string;
      autoCreateCompany?: boolean;
      visibility?: string;
      leadChannel?: LeadChannel | null;
      emails?: ContactEmailEntry[];
      phones?: ContactPhoneEntry[];
    }): Promise<ContactCreateResponse> {
      return request<ContactCreateResponse>("/api/contacts", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    update(
      id: string,
      body: Partial<{
        name: string;
        email: string;
        phone: string;
        title: string;
        linkedinUrl: string;
        companyId: string;
        source: ContactSource;
        funnelStage: FunnelStage;
        isCanvasUser: boolean;
        isSketchUser: boolean;
        usesServices: boolean;
        canvasSignupDate: string;
        visibility: string;
        leadChannel: LeadChannel | null;
        emails: ContactEmailEntry[];
        phones: ContactPhoneEntry[];
      }>,
    ): Promise<ContactUpdateResponse> {
      return request<ContactUpdateResponse>(`/api/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete(id: string): Promise<ContactDeleteResponse> {
      return request<ContactDeleteResponse>(`/api/contacts/${id}`, {
        method: "DELETE",
      });
    },

    batchUpdate(body: { ids: string[]; visibility: string }): Promise<BatchUpdateResponse> {
      return request<BatchUpdateResponse>("/api/contacts/batch", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    batchDelete(ids: string[]): Promise<BatchDeleteResponse> {
      return request<BatchDeleteResponse>("/api/contacts/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },

    addOwner(contactId: string, userId: string): Promise<OwnerResponse> {
      return request<OwnerResponse>(`/api/contacts/${contactId}/owners/${userId}`, {
        method: "POST",
      });
    },

    removeOwner(contactId: string, userId: string): Promise<OwnerResponse> {
      return request<OwnerResponse>(`/api/contacts/${contactId}/owners/${userId}`, {
        method: "DELETE",
      });
    },
  },

  timeline: {
    list(params: {
      contactId?: string;
      companyId?: string;
      type?: string;
      limit?: number;
      offset?: number;
    }): Promise<TimelineResponse> {
      const query = buildQuery(params);
      return request<TimelineResponse>(`/api/timeline${query}`);
    },
  },

  emails: {
    list(contactId: string): Promise<EmailListResponse> {
      const query = buildQuery({ contactId });
      return request<EmailListResponse>(`/api/emails${query}`);
    },
    create(body: {
      contactId: string;
      subject?: string;
      body?: string;
      fromEmail?: string;
      toEmail?: string;
      direction?: string;
      sentAt: string;
      source: string;
    }): Promise<{ email: Email }> {
      return request<{ email: Email }>("/api/emails", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },

  notes: {
    create(body: {
      contactId: string;
      title?: string;
      content: string;
      createdBy?: string;
    }): Promise<NoteCreateResponse> {
      return request<NoteCreateResponse>("/api/notes", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },

  tasks: {
    list(params?: {
      contactId?: string;
      companyId?: string;
      assigneeId?: string;
      completed?: boolean;
      limit?: number;
      offset?: number;
    }): Promise<TaskListResponse> {
      const query = buildQuery(params ?? {});
      return request<TaskListResponse>(`/api/tasks${query}`);
    },

    create(body: {
      contactId?: string;
      companyId?: string;
      title: string;
      assigneeId?: string;
      dueDate?: string;
      createdBy?: string;
    }): Promise<TaskResponse> {
      return request<TaskResponse>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    update(
      id: string,
      body: Partial<{
        title: string;
        assigneeId: string | null;
        dueDate: string | null;
        completed: boolean;
      }>,
    ): Promise<TaskResponse> {
      return request<TaskResponse>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete(id: string): Promise<{ success: true }> {
      return request<{ success: true }>(`/api/tasks/${id}`, {
        method: "DELETE",
      });
    },
  },

  meetings: {
    create(body: {
      contactId: string;
      title?: string;
      startTime: string;
      endTime?: string;
      location?: string;
      description?: string;
      source?: string;
    }): Promise<MeetingResponse> {
      return request<MeetingResponse>("/api/meetings", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },

  insights: {
    contactsNextUp(ids: string[]): Promise<Record<string, NextUpItem>> {
      return request<Record<string, NextUpItem>>("/api/insights/contacts/next-up", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
    companiesNextUp(ids: string[]): Promise<Record<string, NextUpItem>> {
      return request<Record<string, NextUpItem>>("/api/insights/companies/next-up", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
    contactsLastTouched(ids: string[]): Promise<Record<string, LastTouchedItem | null>> {
      return request<Record<string, LastTouchedItem | null>>("/api/insights/contacts/last-touched", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
    companiesLastTouched(ids: string[]): Promise<Record<string, LastTouchedItem | null>> {
      return request<Record<string, LastTouchedItem | null>>("/api/insights/companies/last-touched", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
  },

  users: {
    list(): Promise<UserListResponse> {
      return request<UserListResponse>("/api/users");
    },
  },

  integrations: {
    sourceStatus(): Promise<SourceStatusResponse> {
      return request<SourceStatusResponse>("/api/integrations/source-status");
    },
    gmailStatus(): Promise<GmailStatusResponse> {
      return request<GmailStatusResponse>("/api/integrations/gmail/status");
    },
    gmailSync(body: { syncPeriod: string }): Promise<GmailSyncResponse> {
      return request<GmailSyncResponse>("/api/integrations/gmail/sync", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updateGmailSyncPeriod(body: { period: string }): Promise<{ success: true }> {
      return request<{ success: true }>("/api/integrations/gmail/sync-period", {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    updateCalendarSyncPeriod(body: { period: string }): Promise<{ success: true }> {
      return request<{ success: true }>("/api/integrations/calendar/sync-period", {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    updateCalendarSyncFrequency(body: { frequency: string }): Promise<{ success: true }> {
      return request<{ success: true }>("/api/integrations/calendar/sync-frequency", {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    updateGmailSyncFrequency(body: { frequency: string }): Promise<{ success: true }> {
      return request<{ success: true }>("/api/integrations/gmail/sync-frequency", {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    aimfoxAccounts(): Promise<{
      accounts: Array<{
        id: string;
        urn: string;
        full_name: string;
        public_identifier: string;
        picture_url: string;
        state: string;
        disabled: boolean;
      }>;
    }> {
      return request("/api/integrations/aimfox/accounts");
    },
    aimfoxBackfill(opts?: {
      batchSize?: number;
      syncConversations?: boolean;
      maxLeads?: number;
    }): Promise<{
      result: {
        processed: number;
        contactsCreated: number;
        companiesCreated: number;
      };
    }> {
      return request("/api/integrations/aimfox/backfill", {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      });
    },
  },

  classify: {
    contacts(): Promise<ClassificationResponse> {
      return request<ClassificationResponse>("/api/classify/contacts", {
        method: "POST",
      });
    },
  },

  settings: {
    getInternalDomains(): Promise<InternalDomainsResponse> {
      return request<InternalDomainsResponse>("/api/settings/internal-domains");
    },

    setInternalDomains(domains: string[]): Promise<InternalDomainsResponse> {
      return request<InternalDomainsResponse>("/api/settings/internal-domains", {
        method: "PUT",
        body: JSON.stringify({ domains }),
      });
    },

    getVendorDomains(): Promise<VendorDomainsResponse> {
      return request<VendorDomainsResponse>("/api/settings/vendor-domains");
    },

    addVendorDomain(domain: string, source: "manual" | "ai" = "manual"): Promise<VendorDomainCreateResponse> {
      return request<VendorDomainCreateResponse>("/api/settings/vendor-domains", {
        method: "POST",
        body: JSON.stringify({ domain, source }),
      });
    },

    removeVendorDomain(id: string): Promise<{ success: true }> {
      return request<{ success: true }>(`/api/settings/vendor-domains/${id}`, {
        method: "DELETE",
      });
    },
  },

  dedupLog: {
    async listUnreviewed(): Promise<{ logs: DedupLogEntry[] }> {
      return request("/api/contacts/dedup-log/unreviewed");
    },
    async listByContact(contactId: string): Promise<{ logs: DedupLogEntry[] }> {
      return request(`/api/contacts/${contactId}/dedup-log`);
    },
    async markReviewed(logId: string): Promise<{ log: DedupLogEntry }> {
      return request(`/api/contacts/dedup-log/${logId}/review`, {
        method: "POST",
      });
    },
  },

  ingestion: {
    async csv(formData: FormData): Promise<IngestionResponse> {
      const res = await fetch("/api/ingestion/csv", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          throw new Error("Unauthorized");
        }
        const body = (await res.json().catch(() => ({
          error: { code: "UNKNOWN", message: res.statusText },
        }))) as { error: { code: string; message: string } };
        throw new Error(body.error.message);
      }

      return res.json() as Promise<IngestionResponse>;
    },
  },
};
