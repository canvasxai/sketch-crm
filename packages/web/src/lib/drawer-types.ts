import type { CompanyCategory } from "@crm/shared";

// ── Timeline event types ──

export type DrawerTimelineEventType =
  | "email"
  | "meeting"
  | "meeting_notes"
  | "linkedin_message"
  | "linkedin_research"
  | "internal_discussion"
  | "calendar_event"
  | "canvas_login"
  | "opportunity_stage_change"
  | "note"
  | "task"
  | "contact_created";

/** Which event types can be edited inline */
export const EDITABLE_EVENT_TYPES: ReadonlySet<DrawerTimelineEventType> = new Set([
  "note",
  "meeting_notes",
  "task",
]);

export interface DrawerTimelineEvent {
  id: string;
  type: DrawerTimelineEventType;
  date: string;
  title: string;
  description?: string;
  descriptionHtml?: string;
  direction?: "inbound" | "outbound";
  fromStage?: string;
  toStage?: string;
  changedBy?: string;
  source?: string;
  author?: string;
  platform?: string;
  duration?: string;
  location?: string;
  // Task-specific fields
  completed?: boolean;
  assignee?: string;
  dueDate?: string;
  // LinkedIn research fields
  cost?: string;
  // Company drawer: which contact this event belongs to
  contactName?: string;
}

// ── Timeline filters ──

export const TIMELINE_FILTERS = [
  "all",
  "emails",
  "meetings",
  "notes",
  "tasks",
  "linkedin",
  "internal",
  "logins",
] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

export const filterToTypes: Record<TimelineFilter, DrawerTimelineEventType[] | null> = {
  all: null,
  emails: ["email"],
  meetings: ["meeting", "meeting_notes", "calendar_event"],
  notes: ["note"],
  tasks: ["task"],
  linkedin: ["linkedin_message", "linkedin_research"],
  internal: ["internal_discussion"],
  logins: ["canvas_login"],
};

// ── Drawer tabs ──

export type DrawerTab = "context" | "activity" | "todo";

// ── Tasks ──

export interface DrawerTask {
  id: string;
  title: string;
  assignee: string;
  dueDate?: string;
  completed: boolean;
  contactName?: string;
}

// ── "Next up" / "Last touched" types (for table columns) ──

export type NextUpType = "meeting" | "task" | "reply_needed" | "none";

export interface NextUpItem {
  type: NextUpType;
  label: string;
  dueDate?: string;
  isOverdue?: boolean;
  contactName?: string;
}

export type LastTouchedAction = "email" | "meeting" | "linkedin_message";

export interface LastTouchedItem {
  action: LastTouchedAction;
  label: string; // e.g. "Email 3d ago"
  date: string;
}

// ── Lead channels ──

export const LEAD_CHANNELS = [
  "outbound_email",
  "outbound_linkedin",
  "instagram",
  "referral",
  "inbound",
  "conference",
  "cold_call",
  "organic",
] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export const leadChannelLabels: Record<LeadChannel, string> = {
  outbound_email: "Outbound Email",
  outbound_linkedin: "Outbound LinkedIn",
  instagram: "Instagram",
  referral: "Referral",
  inbound: "Inbound",
  conference: "Conference",
  cold_call: "Cold Call",
  organic: "Organic",
};

// ── Source labels ──

export const sourceLabels: Record<string, string> = {
  linkedin: "LinkedIn",
  apollo: "Apollo",
  csv: "CSV",
  canvas_signup: "Canvas",
  calendar: "Calendar",
  google_calendar: "Calendar",
  manual: "Manual",
  gmail: "Gmail",
};

// ── Category style map (for CompanyCategory) ──

export const CATEGORY_STYLES: Record<CompanyCategory, string> = {
  uncategorized: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  sales: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  client: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  muted: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  hiring: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  contractors: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export const CATEGORY_LABELS: Record<CompanyCategory, string> = {
  uncategorized: "Uncategorized",
  sales: "Sales",
  client: "Client",
  muted: "Muted",
  hiring: "Hiring",
  contractors: "Contractors",
};
