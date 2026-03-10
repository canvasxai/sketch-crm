// ── Funnel stages ──
export const FUNNEL_STAGES = ["new", "qualified", "opportunity", "customer", "dormant", "lost"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

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
export const MEETING_SOURCES = ["google_calendar", "manual", "csv"] as const;
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

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  companyId: string | null;
  source: ContactSource;
  funnelStage: FunnelStage;
  isCanvasUser: boolean;
  isSketchUser: boolean;
  usesServices: boolean;
  canvasSignupDate: string | null;
  visibility: ContactVisibility;
  createdByUserId: string | null;
  leadChannel: LeadChannel | null;
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
  createdAt: string;
  updatedAt: string;
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

export interface StageChange {
  id: string;
  contactId: string;
  fromStage: string;
  toStage: string;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
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

export interface TimelineEntry {
  type: "email" | "linkedin_message" | "meeting" | "note" | "task" | "stage_change";
  data: Email | LinkedinMessage | Meeting | Note | Task | StageChange;
  date: string;
  contactName?: string;
}
