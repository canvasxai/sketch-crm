import type {
  TimelineEntry,
  Email,
  LinkedinMessage,
  Meeting,
  Note,
  Task,
  StageChange,
} from "@crm/shared";
import type { DrawerTimelineEvent, DrawerTimelineEventType } from "./drawer-types";

/**
 * Map an API TimelineEntry to the richer DrawerTimelineEvent format
 * used by the company/contact detail drawers.
 */
export function mapTimelineEntry(entry: TimelineEntry): DrawerTimelineEvent {
  const base = {
    id: (entry.data as { id: string }).id,
    date: entry.date,
    contactName: entry.contactName,
  };

  switch (entry.type) {
    case "email": {
      const email = entry.data as Email;
      // body_html arrives snake_case from the API (no camelCase transform)
      const rawHtml = (entry.data as unknown as Record<string, unknown>).body_html as string | null;
      return {
        ...base,
        type: "email" as DrawerTimelineEventType,
        title: email.subject || "No subject",
        description: email.body ?? undefined,
        descriptionHtml: rawHtml ?? undefined,
        direction: email.direction as "inbound" | "outbound" | undefined,
      };
    }
    case "linkedin_message": {
      const msg = entry.data as LinkedinMessage;
      return {
        ...base,
        type: "linkedin_message" as DrawerTimelineEventType,
        title: "LinkedIn message",
        description: msg.messageText ?? undefined,
        direction: msg.direction as "inbound" | "outbound" | undefined,
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
    case "stage_change": {
      const sc = entry.data as StageChange;
      return {
        ...base,
        type: "stage_change" as DrawerTimelineEventType,
        title: "Stage changed",
        fromStage: sc.fromStage,
        toStage: sc.toStage,
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
