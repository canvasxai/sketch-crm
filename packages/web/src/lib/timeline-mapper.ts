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
      return {
        ...base,
        type: "meeting" as DrawerTimelineEventType,
        title: meeting.title ?? "Untitled meeting",
        location: meeting.location ?? undefined,
        description: meeting.description ?? undefined,
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
