// ── Company category classifications ──
export const COMPANY_CATEGORIES = ["uncategorized", "sales", "client", "muted", "hiring", "contractors"] as const;
export type CompanyCategory = (typeof COMPANY_CATEGORIES)[number];

// Legacy aliases (Sense A rename: pipeline → category)
export const COMPANY_PIPELINES = COMPANY_CATEGORIES;
export type CompanyPipeline = CompanyCategory;

// ── Contact category (AI-assigned classification) ──
export const CONTACT_CATEGORIES = ["sales", "client", "muted", "hiring", "contractors"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

// Legacy aliases
export const CONTACT_PIPELINES = CONTACT_CATEGORIES;
export type ContactPipeline = ContactCategory;

// ── Pipeline stage types ──
export const STAGE_TYPES = ["active", "won", "lost"] as const;
export type StageType = (typeof STAGE_TYPES)[number];

// ── Value periods ──
export const VALUE_PERIODS = ["one_time", "monthly", "annual"] as const;
export type ValuePeriod = (typeof VALUE_PERIODS)[number];

// ── Contact sources ──
export const CONTACT_SOURCES = ["linkedin", "apollo", "canvas_signup", "csv", "calendar", "manual", "gmail", "google_calendar"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

// ── Contact visibility ──
export const CONTACT_VISIBILITIES = ["private", "shared", "unreviewed"] as const;
export type ContactVisibility = (typeof CONTACT_VISIBILITIES)[number];

// ── Company sources ──
export const COMPANY_SOURCES = ["linkedin", "apollo", "csv", "manual", "email_domain"] as const;
export type CompanySource = (typeof COMPANY_SOURCES)[number];

// ── Activity directions ──
export const ACTIVITY_DIRECTIONS = ["inbound", "outbound"] as const;
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number];

// ── Email sources ──
export const EMAIL_SOURCES = ["manual", "csv", "gmail"] as const;
export type EmailSource = (typeof EMAIL_SOURCES)[number];

// ── LinkedIn message sources ──
export const LINKEDIN_MESSAGE_SOURCES = ["aimfox", "csv", "manual"] as const;
export type LinkedinMessageSource = (typeof LINKEDIN_MESSAGE_SOURCES)[number];

// ── Meeting sources ──
export const MEETING_SOURCES = ["google_calendar", "fireflies", "manual", "csv"] as const;
export type MeetingSource = (typeof MEETING_SOURCES)[number];

// ── User roles ──
export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ── Lead channels ──
export const LEAD_CHANNELS = ["outbound_email", "outbound_linkedin", "instagram", "referral", "inbound", "conference", "cold_call", "organic"] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

// ── Core types ──

export interface User {
  id: string;
  name: string;
  email: string;
  googleId: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  source: CompanySource | null;
  description: string | null;
  techStack: string | null;
  fundingStage: string | null;
  category: CompanyCategory;
  createdAt: string;
  updatedAt: string;
}

export interface ContactEmailEntry {
  email: string;
  type: string; // work, personal, other
  isPrimary: boolean;
}

export interface ContactPhoneEntry {
  phone: string;
  type: string; // work, mobile, personal, other
  isPrimary: boolean;
}

export interface ContactOwner {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  companyId: string | null;
  source: ContactSource;
  category: ContactCategory; // always in sync with company
  isCanvasUser: boolean;
  isSketchUser: boolean;
  usesServices: boolean;
  isDecisionMaker: boolean;
  canvasSignupDate: string | null;
  visibility: ContactVisibility;
  createdByUserId: string | null;
  leadChannel: LeadChannel | null;
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
  needsClassification: boolean;
  aiConfidence: string | null;
  aiSummary: string | null;
  aiClassifiedAt: string | null;
  owners?: ContactOwner[];
  createdAt: string;
  updatedAt: string;
}

// ── Pipelines & Stages (configurable product pipelines) ──

export interface Pipeline {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  label: string;
  stageType: StageType;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineWithStages extends Pipeline {
  stages: PipelineStage[];
}

// ── Opportunities (deals) ──

export interface Opportunity {
  id: string;
  companyId: string | null;
  contactId: string | null;
  pipelineId: string;
  stageId: string;
  title: string | null;
  value: number | null;
  valuePeriod: ValuePeriod | null;
  confidence: number | null;
  closeDate: string | null;
  ownerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  stageLabel?: string;
  stageType?: StageType;
  stagePosition?: number;
  pipelineName?: string;
  companyName?: string;
  companyDomain?: string | null;
  contactName?: string;
  contactEmail?: string | null;
  ownerName?: string;
}

export interface OpportunityStageChange {
  id: string;
  opportunityId: string;
  fromStageId: string | null;
  toStageId: string;
  changedBy: string | null;
  changedByName: string | null;
  fromStageLabel: string | null;
  toStageLabel: string;
  createdAt: string;
}

export interface Email {
  id: string;
  contactId: string;
  subject: string | null;
  body: string | null;
  bodyHtml: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  cc: string | null;
  bcc: string | null;
  threadId: string | null;
  inReplyTo: string | null;
  direction: ActivityDirection;
  sentAt: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedinMessage {
  id: string;
  contactId: string;
  messageText: string | null;
  conversationId: string | null;
  aimfoxMessageId: string | null;
  connectionStatus: string | null;
  direction: ActivityDirection;
  sentAt: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  contactId: string;
  title: string | null;
  description: string | null;
  location: string | null;
  meetingLink: string | null;
  startTime: string;
  endTime: string | null;
  attendees: string | null;
  notes: string | null;
  calendarEventId: string | null;
  firefliesTranscriptId: string | null;
  aiSummary: string | null;
  actionItems: string[] | null;
  keywords: string[] | null;
  durationMinutes: number | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  contactId: string;
  title: string | null;
  content: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  contactId: string | null;
  companyId: string | null;
  opportunityId: string | null;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Personal email domains ──

/** Well-known personal/free email providers (~30 domains). */
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  // Yahoo
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.ca",
  "yahoo.com.au",
  "ymail.com",
  "rocketmail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Privacy-focused
  "protonmail.com",
  "proton.me",
  "tutanota.com",
  "tutamail.com",
  // Classic / legacy
  "aol.com",
  "aim.com",
  "mail.com",
  "email.com",
  "inbox.com",
  // Regional / other popular
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "gmx.de",
  "fastmail.com",
  "hey.com",
  "pm.me",
]);

/**
 * Returns `true` if the domain belongs to a well-known personal/free email
 * provider (Gmail, Outlook, Yahoo, etc.).
 */
export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export interface DedupLogEntry {
  id: string;
  contactId: string;
  mergedEmail: string;
  mergedName: string | null;
  matchReason: string;
  aiConfidence: string | null;
  reviewed: boolean;
  createdAt: string;
}

export interface MutedDomain {
  id: string;
  domain: string;
  source: string;
  createdAt: string;
}

export interface DedupCandidateContact {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  source: string;
  linkedinUrl: string | null;
  aiSummary: string | null;
  companyName: string | null;
}

export interface DedupCandidate {
  id: string;
  matchReason: string;
  aiConfidence: string | null;
  status: string;
  createdAt: string;
  contactA: DedupCandidateContact;
  contactB: DedupCandidateContact;
}

export interface TimelineEntry {
  type: "email" | "linkedin_message" | "meeting" | "note" | "task" | "opportunity_stage_change";
  data: Email | LinkedinMessage | Meeting | Note | Task | OpportunityStageChange;
  date: string;
  contactName?: string;
}

// ── Classification (async AI classification jobs) ──

export interface ClassificationRun {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  totalContacts: number;
  processedContacts: number;
  categoryChanges: number;
  errors: number;
  startedAt: string;
  completedAt: string | null;
}

export interface ClassificationLogEntry {
  id: string;
  contactId: string;
  contactName?: string;
  companyName?: string | null;
  categoryAssigned: string | null;
  previousCategory: string | null;
  aiSummary: string | null;
  confidence: string | null;
  createdAt: string;
}
