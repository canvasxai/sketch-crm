import type {
  TimelineEntry,
  Email,
  LinkedinMessage,
  Meeting,
  Note,
  Task,
  OpportunityStageChange,
} from "@crm/shared";
import type { DrawerTimelineEvent, DrawerTimelineEventType } from "./drawer-types";

/** Lightweight markdown → HTML for Fireflies summaries (bold, bullets, newlines) */
function simpleMarkdownToHtml(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      // Bold: **text**
      const withBold = trimmed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      // Bullet lines
      if (/^[-•]\s/.test(trimmed)) {
        return `<li>${withBold.replace(/^[-•]\s*/, "")}</li>`;
      }
      return `<p>${withBold}</p>`;
    })
    .join("")
    .replace(/(<li>.*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);
}

/**
 * Map an API TimelineEntry to the richer DrawerTimelineEvent format
 * used by the company/contact detail drawers.
 *
 * @param contactName — optional name of the contact; used to render
 *   "You" / first-name prefixes on emails and LinkedIn messages.
 */
export function mapTimelineEntry(entry: TimelineEntry, contactName?: string): DrawerTimelineEvent {
  const base = {
    id: (entry.data as { id: string }).id,
    date: entry.date,
    contactName: entry.contactName,
  };

  switch (entry.type) {
    case "email": {
      const email = entry.data as Email;
      const rawEmail = entry.data as unknown as Record<string, unknown>;
      // body_html arrives snake_case from the API (no camelCase transform)
      const rawHtml = rawEmail.body_html as string | null;
      const emailDir = (rawEmail.direction ?? email.direction) as "inbound" | "outbound" | undefined;
      const emailSender = emailDir === "outbound"
        ? "You"
        : (contactName ?? entry.contactName ?? "").split(" ")[0] || "Them";
      return {
        ...base,
        type: "email" as DrawerTimelineEventType,
        title: `${emailSender}: ${email.subject || "No subject"}`,
        description: email.body ?? undefined,
        descriptionHtml: rawHtml ?? undefined,
        // No direction badge — sender name in the title conveys it
      };
    }
    case "linkedin_message": {
      // API returns snake_case fields from DB; access raw data for message_text
      const raw = entry.data as unknown as Record<string, unknown>;
      const messageText = (raw.message_text ?? raw.messageText) as string | null;
      const msgDirection = raw.direction as "inbound" | "outbound" | undefined;
      const senderName = msgDirection === "outbound"
        ? "You"
        : (contactName ?? entry.contactName ?? "").split(" ")[0] || "Them";
      return {
        ...base,
        type: "linkedin_message" as DrawerTimelineEventType,
        title: senderName,
        description: messageText ?? undefined,
      };
    }
    case "meeting": {
      const meeting = entry.data as Meeting;
      const raw = entry.data as unknown as Record<string, unknown>;
      const aiSummary = (raw.ai_summary ?? raw.aiSummary) as string | null;
      const rawActionItems = raw.action_items ?? raw.actionItems;
      const rawKeywords = raw.keywords ?? raw.keywords;
      const durationMinutes = (raw.duration_minutes ?? raw.durationMinutes) as number | null;

      // action_items can be a string (from Fireflies) or string[]
      const actionItems: string[] = Array.isArray(rawActionItems)
        ? rawActionItems
        : typeof rawActionItems === "string" && rawActionItems.trim()
          ? rawActionItems.split("\n").filter((l: string) => l.trim())
          : [];

      // keywords can be a string[] or comma-separated string
      const keywords: string[] = Array.isArray(rawKeywords)
        ? rawKeywords
        : typeof rawKeywords === "string" && rawKeywords.trim()
          ? rawKeywords.split(",").map((k: string) => k.trim()).filter(Boolean)
          : [];

      // Convert markdown summary to simple HTML for rendering
      const descriptionHtml = aiSummary ? simpleMarkdownToHtml(aiSummary) : undefined;

      return {
        ...base,
        type: "meeting" as DrawerTimelineEventType,
        title: meeting.title ?? "Untitled meeting",
        location: meeting.location ?? undefined,
        description: aiSummary ?? meeting.description ?? undefined,
        descriptionHtml,
        aiSummary: aiSummary ?? undefined,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        durationMinutes: durationMinutes ?? undefined,
      };
    }
    case "note": {
      const note = entry.data as Note;
      return {
        ...base,
        type: "note" as DrawerTimelineEventType,
        title: note.title || "Note",
        description: note.content,
      };
    }
    case "task": {
      const task = entry.data as Task;
      return {
        ...base,
        type: "task" as DrawerTimelineEventType,
        title: task.title,
        completed: task.completed,
        assignee: task.assigneeName ?? undefined,
        dueDate: task.dueDate ?? undefined,
      };
    }
    case "opportunity_stage_change": {
      const sc = entry.data as OpportunityStageChange;
      return {
        ...base,
        type: "opportunity_stage_change" as DrawerTimelineEventType,
        title: "Stage changed",
        fromStage: sc.fromStageLabel ?? undefined,
        toStage: sc.toStageLabel,
        changedBy: sc.changedByName ?? undefined,
      };
    }
    default:
      return {
        ...base,
        type: entry.type as DrawerTimelineEventType,
        title: "Activity",
      };
  }
}
