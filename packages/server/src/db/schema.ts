/**
 * Kysely DB type interface — defines the shape of all database tables.
 * Generated<T> means the column has a server-side default and is optional on INSERT.
 */
import type { Generated } from "kysely";

// ── Users (internal team members, authenticated via Google OAuth) ──

export interface UsersTable {
  id: Generated<string>;
  name: string;
  email: string;
  google_id: string | null;
  avatar_url: string | null;
  role: Generated<string>;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Companies ──

export interface CompaniesTable {
  id: Generated<string>;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  source: string | null;
  description: string | null;
  tech_stack: string | null;
  funding_stage: string | null;
  category: Generated<string>; // 'uncategorized' | 'sales' | 'client' | 'muted' | 'hiring' | 'contractors'
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Company Owners (many-to-many: companies ↔ users) ──

export interface CompanyOwnersTable {
  company_id: string;
  user_id: string;
  created_at: Generated<string>;
}

// ── Contacts (central entity — one person) ──

export interface ContactsTable {
  id: Generated<string>;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  company_id: string | null;
  source: string;
  category: Generated<string>; // 'uncategorized' | 'sales' | 'client' | 'muted' | 'hiring' | 'contractors'
  is_canvas_user: Generated<boolean>;
  is_sketch_user: Generated<boolean>;
  uses_services: Generated<boolean>;
  is_decision_maker: Generated<boolean>;
  canvas_signup_date: string | null;
  visibility: Generated<string>;
  created_by_user_id: string | null;
  lead_channel: string | null;
  emails: Generated<string>; // jsonb — ContactEmailEntry[]
  phones: Generated<string>; // jsonb — ContactPhoneEntry[]
  aimfox_lead_id: string | null;
  aimfox_profile_data: unknown | null; // jsonb — rich LinkedIn profile data
  ai_summary: string | null;
  ai_classified_at: string | null;
  ai_confidence: string | null;
  needs_classification: Generated<boolean>;
  linkedin_enriched_at: string | null;
  dedup_checked_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Pipelines (configurable product pipelines: Services, Canvas, Sketch) ──

export interface PipelinesTable {
  id: Generated<string>;
  name: string;
  position: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Pipeline Stages (configurable stages within each pipeline) ──

export interface PipelineStagesTable {
  id: Generated<string>;
  pipeline_id: string;
  label: string;
  stage_type: Generated<string>; // 'active' | 'won' | 'lost'
  position: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Opportunities (deals linked to company + pipeline + stage) ──

export interface OpportunitiesTable {
  id: Generated<string>;
  company_id: string | null;
  contact_id: string | null;
  pipeline_id: string;
  stage_id: string;
  title: string | null;
  value: number | null;
  value_period: string | null; // 'one_time' | 'monthly' | 'annual'
  confidence: number | null;
  close_date: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Opportunity Stage Changes (audit trail for stage transitions) ──

export interface OpportunityStageChangesTable {
  id: Generated<string>;
  opportunity_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  created_at: Generated<string>;
}

// ── Tasks ──

export interface TasksTable {
  id: Generated<string>;
  contact_id: string | null;
  company_id: string | null;
  opportunity_id: string | null;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  completed: Generated<boolean>;
  completed_at: string | null;
  created_by: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Org Settings (key-value store for organization-wide config) ──

export interface OrgSettingsTable {
  key: string;
  value: unknown;
}

// ── Contact Owners (many-to-many: contacts ↔ users) ──

export interface ContactOwnersTable {
  contact_id: string;
  user_id: string;
  created_at: Generated<string>;
}

// ── Emails ──

export interface EmailsTable {
  id: Generated<string>;
  contact_id: string;
  subject: string | null;
  body: string | null;
  body_html: string | null;
  from_email: string | null;
  to_email: string | null;
  cc: string | null;
  bcc: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  direction: Generated<string>;
  sent_at: string;
  source: string;
  gmail_message_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── LinkedIn Messages ──

export interface LinkedinMessagesTable {
  id: Generated<string>;
  contact_id: string;
  message_text: string | null;
  conversation_id: string | null;
  aimfox_message_id: string | null;
  connection_status: string | null;
  direction: Generated<string>;
  sent_at: string;
  source: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Meetings ──

export interface MeetingsTable {
  id: Generated<string>;
  contact_id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  meeting_link: string | null;
  start_time: string;
  end_time: string | null;
  attendees: string | null;
  notes: string | null;
  calendar_event_id: string | null;
  source: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Notes (manual notes / internal comments) ──

export interface NotesTable {
  id: Generated<string>;
  contact_id: string;
  title: string | null;
  content: string;
  created_by: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Gmail Sync State ──

export interface GmailSyncStateTable {
  id: Generated<string>;
  user_id: string;
  last_sync_at: string | null;
  sync_history_id: string | null;
  status: Generated<string>;
  error_message: string | null;
  emails_synced: Generated<number>;
  contacts_created: Generated<number>;
  companies_created: Generated<number>;
  sync_frequency: Generated<string>;
  sync_period: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Calendar Sync State ──

export interface CalendarSyncStateTable {
  id: Generated<string>;
  user_id: string;
  last_sync_at: string | null;
  sync_token: string | null;
  status: Generated<string>;
  error_message: string | null;
  events_synced: Generated<number>;
  contacts_created: Generated<number>;
  meetings_created: Generated<number>;
  sync_frequency: Generated<string>;
  sync_period: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Muted Domains (blocked domains for email sync, formerly vendor_domains) ──

export interface MutedDomainsTable {
  id: Generated<string>;
  domain: string;
  source: Generated<string>; // "manual" | "ai"
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── AimFox Sync State ──

export interface AimfoxSyncStateTable {
  id: Generated<string>;
  last_sync_at: string | null;
  last_webhook_at: string | null;
  status: Generated<string>;
  error_message: string | null;
  leads_synced: Generated<number>;
  messages_synced: Generated<number>;
  contacts_created: Generated<number>;
  companies_created: Generated<number>;
  last_backfill_cursor: number | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── AimFox Webhook Log ──

export interface AimfoxWebhookLogTable {
  id: Generated<string>;
  event_type: string;
  payload: unknown; // jsonb
  processed: Generated<boolean>;
  error_message: string | null;
  created_at: Generated<string>;
}

// ── Dedup Log (audit trail for AI-driven contact merges) ──

export interface DedupLogTable {
  id: Generated<string>;
  contact_id: string;
  merged_email: string;
  merged_name: string | null;
  match_reason: string; // "ai_name_similarity"
  ai_confidence: string | null;
  reviewed: Generated<boolean>;
  created_at: Generated<string>;
}

// ── Dedup Candidates (Tier 3 fuzzy match review queue) ──

export interface DedupCandidatesTable {
  id: Generated<string>;
  contact_id_a: string;
  contact_id_b: string;
  match_reason: string;
  ai_confidence: string | null;
  status: Generated<string>; // 'pending' | 'merged' | 'dismissed'
  created_at: Generated<string>;
  resolved_at: string | null;
}

// ── Classification Runs (async classification job tracking) ──

export interface ClassificationRunsTable {
  id: Generated<string>;
  status: Generated<string>; // 'running' | 'completed' | 'failed'
  total_contacts: Generated<number>;
  processed_contacts: Generated<number>;
  category_changes: Generated<number>;
  errors: Generated<number>;
  started_at: Generated<string>;
  completed_at: string | null;
}

// ── Classification Logs (per-contact classification audit trail) ──

export interface ClassificationLogsTable {
  id: Generated<string>;
  contact_id: string;
  run_id: string;
  category_assigned: string | null;
  previous_category: string | null;
  ai_summary: string | null;
  confidence: string | null;
  created_at: Generated<string>;
}

// ── DB root type ──

export interface DB {
  users: UsersTable;
  companies: CompaniesTable;
  company_owners: CompanyOwnersTable;
  contacts: ContactsTable;
  contact_owners: ContactOwnersTable;
  pipelines: PipelinesTable;
  pipeline_stages: PipelineStagesTable;
  opportunities: OpportunitiesTable;
  opportunity_stage_changes: OpportunityStageChangesTable;
  emails: EmailsTable;
  linkedin_messages: LinkedinMessagesTable;
  meetings: MeetingsTable;
  notes: NotesTable;
  tasks: TasksTable;
  gmail_sync_state: GmailSyncStateTable;
  calendar_sync_state: CalendarSyncStateTable;
  org_settings: OrgSettingsTable;
  muted_domains: MutedDomainsTable;
  dedup_log: DedupLogTable;
  aimfox_sync_state: AimfoxSyncStateTable;
  aimfox_webhook_log: AimfoxWebhookLogTable;
  dedup_candidates: DedupCandidatesTable;
  classification_runs: ClassificationRunsTable;
  classification_logs: ClassificationLogsTable;
}
