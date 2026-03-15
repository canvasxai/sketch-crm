import type {
  ClassificationLogEntry,
  ClassificationRun,
  Company,
  CompanyCategory,
  CompanySource,
  Contact,
  ContactEmailEntry,
  ContactPhoneEntry,
  ContactCategory,
  ContactSource,
  DedupCandidate,
  DedupLogEntry,
  Email,
  LeadChannel,
  Meeting,
  MutedDomain,
  Note,
  Opportunity,
  OpportunityStageChange,
  Pipeline,
  PipelineStage,
  PipelineWithStages,
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

interface MutedDomainsResponse {
  domains: MutedDomain[];
}

interface MutedDomainCreateResponse {
  domain: MutedDomain;
  purged: { contactsRemoved: number; companiesRemoved: number };
}

// ── Pipeline / Opportunity response types ──

interface PipelineListResponse {
  pipelines: PipelineWithStages[];
}

interface PipelineDetailResponse {
  pipeline: PipelineWithStages;
}

interface PipelineCreateResponse {
  pipeline: PipelineWithStages;
}

interface PipelineUpdateResponse {
  pipeline: PipelineWithStages;
}

interface StageResponse {
  stage: PipelineStage;
}

interface OpportunityListResponse {
  opportunities: Opportunity[];
  total: number;
}

interface OpportunityDetailResponse {
  opportunity: Opportunity;
}

interface OpportunityCreateResponse {
  opportunity: Opportunity;
}

interface OpportunityUpdateResponse {
  opportunity: Opportunity;
}

interface StageChangesResponse {
  stageChanges: OpportunityStageChange[];
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

interface ClassificationStartResponse {
  runId: string | null;
  message?: string;
}

interface ClassificationRunsListResponse {
  runs: ClassificationRun[];
}

interface ClassificationRunResponse {
  run: ClassificationRun | null;
  logs: ClassificationLogEntry[];
}

interface NeedsClassificationCountResponse {
  count: number;
}

interface ClassificationHistoryResponse {
  logs: ClassificationLogEntry[];
}

interface NeedsReviewListResponse {
  contacts: Contact[];
}

interface NeedsReviewCountResponse {
  count: number;
}

interface DedupCandidatesListResponse {
  candidates: DedupCandidate[];
}

interface DedupCandidateCountResponse {
  count: number;
}

interface MergeContactResponse {
  contact: Contact;
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
    oldestEmailAt: string | null;
    newestEmailAt: string | null;
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
    pagesFetched: number;
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
  fireflies: {
    connected: boolean;
    lastSyncAt: string | null;
    status: string;
    errorMessage: string | null;
    transcriptsSynced: number;
    meetingsCreated: number;
    contactsMatched: number;
    syncPeriod: string;
    oldestTranscriptAt: string | null;
    newestTranscriptAt: string | null;
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
      category?: CompanyCategory;
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
      category?: CompanyCategory;
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
        category: CompanyCategory;
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
      category?: ContactCategory;
      source?: ContactSource;
      visibility?: string;
      companyId?: string;
      ownerId?: string;
      isCanvasUser?: boolean;
      isSketchUser?: boolean;
      usesServices?: boolean;
      isDecisionMaker?: boolean;
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
      category?: ContactCategory;
      isCanvasUser?: boolean;
      isSketchUser?: boolean;
      usesServices?: boolean;
      isDecisionMaker?: boolean;
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
        category: ContactCategory;
        isCanvasUser: boolean;
        isSketchUser: boolean;
        usesServices: boolean;
        isDecisionMaker: boolean;
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

    enrichLinkedin(contactId: string): Promise<{ contact: Contact; linkedinUrl: string | null; alreadyHasLinkedin?: boolean }> {
      return request(`/api/contacts/${contactId}/enrich-linkedin`, {
        method: "POST",
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
      opportunityId?: string;
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
      opportunityId?: string;
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
    gmailSync(body: { syncPeriod: string } | { after: string; before: string }): Promise<GmailSyncResponse> {
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
    cancelAimfoxBackfill(): Promise<{ success: true; wasRunning: boolean }> {
      return request("/api/integrations/aimfox/cancel", {
        method: "POST",
      });
    },
    cancelGmailSync(): Promise<{ success: true }> {
      return request("/api/integrations/gmail/cancel", {
        method: "POST",
      });
    },
    firefliesStatus(): Promise<{
      connected: boolean;
      status: string;
      lastSyncAt: string | null;
      errorMessage: string | null;
      transcriptsSynced: number;
      meetingsCreated: number;
      contactsMatched: number;
      syncPeriod: string;
    }> {
      return request("/api/integrations/fireflies/status");
    },
    firefliesSync(body: { after: string; before: string }): Promise<{ success: true; message: string }> {
      return request("/api/integrations/fireflies/sync", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    cancelFirefliesSync(): Promise<{ success: true; wasRunning: boolean }> {
      return request("/api/integrations/fireflies/cancel", {
        method: "POST",
      });
    },
  },

  classify: {
    contacts(): Promise<ClassificationStartResponse> {
      return request<ClassificationStartResponse>("/api/classify/contacts", {
        method: "POST",
      });
    },
    runs(): Promise<ClassificationRunsListResponse> {
      return request<ClassificationRunsListResponse>("/api/classify/runs");
    },
    run(runId: string): Promise<ClassificationRunResponse> {
      return request<ClassificationRunResponse>(`/api/classify/runs/${runId}`);
    },
    latestRun(): Promise<ClassificationRunResponse> {
      return request<ClassificationRunResponse>("/api/classify/runs/latest");
    },
    needsClassificationCount(): Promise<NeedsClassificationCountResponse> {
      return request<NeedsClassificationCountResponse>("/api/classify/contacts/needs-classification/count");
    },
    contactHistory(contactId: string): Promise<ClassificationHistoryResponse> {
      return request<ClassificationHistoryResponse>(`/api/classify/contacts/${contactId}/classification-history`);
    },
    cancel(): Promise<{ success: true; wasRunning: boolean }> {
      return request("/api/classify/cancel", { method: "POST" });
    },
    needsReviewList(params?: { limit?: number; offset?: number }): Promise<NeedsReviewListResponse> {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<NeedsReviewListResponse>(`/api/classify/contacts/needs-review${query ? `?${query}` : ""}`);
    },
    needsReviewCount(): Promise<NeedsReviewCountResponse> {
      return request<NeedsReviewCountResponse>("/api/classify/contacts/needs-review/count");
    },
    confirmClassification(contactId: string, category: string): Promise<{ contact: Contact }> {
      return request<{ contact: Contact }>(`/api/classify/contacts/${contactId}/confirm-classification`, {
        method: "POST",
        body: JSON.stringify({ category }),
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

    getMutedDomains(): Promise<MutedDomainsResponse> {
      return request<MutedDomainsResponse>("/api/settings/muted-domains");
    },

    addMutedDomain(domain: string, source: "manual" | "ai" = "manual"): Promise<MutedDomainCreateResponse> {
      return request<MutedDomainCreateResponse>("/api/settings/muted-domains", {
        method: "POST",
        body: JSON.stringify({ domain, source }),
      });
    },

    removeMutedDomain(id: string): Promise<{ success: true }> {
      return request<{ success: true }>(`/api/settings/muted-domains/${id}`, {
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

  dedupCandidates: {
    listPending(): Promise<DedupCandidatesListResponse> {
      return request<DedupCandidatesListResponse>("/api/contacts/dedup-candidates/pending");
    },
    countPending(): Promise<DedupCandidateCountResponse> {
      return request<DedupCandidateCountResponse>("/api/contacts/dedup-candidates/count");
    },
    merge(keepContactId: string, mergeContactId: string): Promise<MergeContactResponse> {
      return request<MergeContactResponse>("/api/contacts/merge", {
        method: "POST",
        body: JSON.stringify({ keepContactId, mergeContactId }),
      });
    },
    dismiss(candidateId: string): Promise<{ candidate: DedupCandidate }> {
      return request<{ candidate: DedupCandidate }>(`/api/contacts/dedup-candidates/${candidateId}/dismiss`, {
        method: "POST",
      });
    },
    contactIdsWithPending(): Promise<{ contactIds: string[] }> {
      return request<{ contactIds: string[] }>("/api/contacts/dedup-candidates/contact-ids");
    },
  },

  pipelines: {
    list(): Promise<PipelineListResponse> {
      return request<PipelineListResponse>("/api/pipelines");
    },

    get(id: string): Promise<PipelineDetailResponse> {
      return request<PipelineDetailResponse>(`/api/pipelines/${id}`);
    },

    create(body: { name: string; position?: number }): Promise<PipelineCreateResponse> {
      return request<PipelineCreateResponse>("/api/pipelines", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    update(id: string, body: Partial<{ name: string; position: number }>): Promise<PipelineUpdateResponse> {
      return request<PipelineUpdateResponse>(`/api/pipelines/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete(id: string): Promise<{ success: true }> {
      return request<{ success: true }>(`/api/pipelines/${id}`, {
        method: "DELETE",
      });
    },

    addStage(
      pipelineId: string,
      body: { label: string; stageType?: string; position?: number },
    ): Promise<StageResponse> {
      return request<StageResponse>(`/api/pipelines/${pipelineId}/stages`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    updateStage(
      stageId: string,
      body: Partial<{ label: string; stageType: string; position: number }>,
    ): Promise<StageResponse> {
      return request<StageResponse>(`/api/pipeline-stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    deleteStage(stageId: string): Promise<{ success: true }> {
      return request<{ success: true }>(`/api/pipeline-stages/${stageId}`, {
        method: "DELETE",
      });
    },
  },

  opportunities: {
    list(params?: {
      pipelineId?: string;
      stageId?: string;
      stageType?: string;
      companyId?: string;
      contactId?: string;
      ownerId?: string;
      limit?: number;
      offset?: number;
    }): Promise<OpportunityListResponse> {
      const query = buildQuery(params ?? {});
      return request<OpportunityListResponse>(`/api/opportunities${query}`);
    },

    get(id: string): Promise<OpportunityDetailResponse> {
      return request<OpportunityDetailResponse>(`/api/opportunities/${id}`);
    },

    create(body: {
      companyId?: string;
      contactId?: string;
      pipelineId: string;
      stageId: string;
      title?: string;
      value?: number;
      valuePeriod?: string;
      confidence?: number;
      closeDate?: string;
      ownerId?: string;
      notes?: string;
    }): Promise<OpportunityCreateResponse> {
      return request<OpportunityCreateResponse>("/api/opportunities", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    update(
      id: string,
      body: Partial<{
        companyId: string | null;
        contactId: string | null;
        pipelineId: string;
        stageId: string;
        title: string | null;
        value: number | null;
        valuePeriod: string | null;
        confidence: number | null;
        closeDate: string | null;
        ownerId: string | null;
        notes: string | null;
      }>,
    ): Promise<OpportunityUpdateResponse> {
      return request<OpportunityUpdateResponse>(`/api/opportunities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    delete(id: string): Promise<{ success: true }> {
      return request<{ success: true }>(`/api/opportunities/${id}`, {
        method: "DELETE",
      });
    },

    stageChanges(opportunityId: string): Promise<StageChangesResponse> {
      return request<StageChangesResponse>(`/api/opportunities/${opportunityId}/stage-changes`);
    },
  },

  actions: {
    generate(): Promise<{ runId: string }> {
      return request("/api/actions/generate", { method: "POST" });
    },
    generateForContact(contactId: string): Promise<{ result: { tasksCreated: number } }> {
      return request(`/api/actions/generate/${contactId}`, { method: "POST" });
    },
    runs(): Promise<{
      runs: Array<{
        id: string;
        status: string;
        totalContacts: number;
        processedContacts: number;
        tasksCreated: number;
        errors: number;
        startedAt: string;
        completedAt: string | null;
      }>;
    }> {
      return request("/api/actions/runs");
    },
    latestRun(): Promise<{
      run: {
        id: string;
        status: string;
        totalContacts: number;
        processedContacts: number;
        tasksCreated: number;
        errors: number;
        startedAt: string;
        completedAt: string | null;
      } | null;
    }> {
      return request("/api/actions/runs/latest");
    },
    run(runId: string): Promise<{
      run: {
        id: string;
        status: string;
        totalContacts: number;
        processedContacts: number;
        tasksCreated: number;
        errors: number;
        startedAt: string;
        completedAt: string | null;
      };
    }> {
      return request(`/api/actions/runs/${runId}`);
    },
    cancel(): Promise<{ success: true; wasRunning: boolean }> {
      return request("/api/actions/cancel", { method: "POST" });
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
