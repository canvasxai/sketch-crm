import {
  EnvelopeSimple,
  LinkedinLogo,
  CalendarCheck,
  NoteBlank,
  CheckSquare,
  ArrowsLeftRight,
} from "@phosphor-icons/react";
import type { TimelineEntry, Email, LinkedinMessage, Meeting, Note, Task, OpportunityStageChange } from "@crm/shared";

import { Badge } from "@/components/ui/badge";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

const typeConfig: Record<
  TimelineEntry["type"],
  { icon: React.ElementType; label: string }
> = {
  email: { icon: EnvelopeSimple, label: "Email" },
  linkedin_message: { icon: LinkedinLogo, label: "LinkedIn Message" },
  meeting: { icon: CalendarCheck, label: "Meeting" },
  note: { icon: NoteBlank, label: "Note" },
  task: { icon: CheckSquare, label: "Task" },
  opportunity_stage_change: { icon: ArrowsLeftRight, label: "Stage Change" },
};

interface TimelineItemProps {
  entry: TimelineEntry;
  /** Contact's display name — used to show "You" vs first name on messages */
  contactName?: string;
}

export function TimelineItem({ entry, contactName }: TimelineItemProps) {
  const config = typeConfig[entry.type];
  const Icon = config.icon;

  function renderContent() {
    switch (entry.type) {
      case "email": {
        const rawEmail = entry.data as unknown as Record<string, unknown>;
        const emailDirection = (rawEmail.direction ?? (entry.data as Email).direction) as string | undefined;
        const emailSubject = (rawEmail.subject ?? (entry.data as Email).subject) as string | null;
        const emailSender = emailDirection === "outbound"
          ? "You"
          : (contactName?.split(" ")[0] ?? "Them");
        return (
          <span className="text-sm text-muted-foreground mt-0.5">
            {emailSender}: {emailSubject || "No subject"}
          </span>
        );
      }
      case "linkedin_message": {
        // API returns snake_case fields from DB; access raw data for message_text
        const rawMsg = entry.data as unknown as Record<string, unknown>;
        const messageText = (rawMsg.message_text ?? rawMsg.messageText) as string | null;
        const direction = rawMsg.direction as string | undefined;
        const senderLabel = direction === "outbound"
          ? "You"
          : (contactName?.split(" ")[0] ?? "Them");
        return (
          <div className="mt-0.5">
            <span className="text-sm text-foreground">{senderLabel}</span>
            {messageText && (
              <p className="text-sm text-muted-foreground line-clamp-2">{messageText}</p>
            )}
          </div>
        );
      }
      case "meeting": {
        const meeting = entry.data as Meeting;
        const rawMeeting = entry.data as unknown as Record<string, unknown>;
        const aiSummary = (rawMeeting.ai_summary ?? rawMeeting.aiSummary) as string | null;
        const rawActionItems = rawMeeting.action_items ?? rawMeeting.actionItems;
        const rawKeywords = rawMeeting.keywords ?? rawMeeting.keywords;
        const durationMinutes = (rawMeeting.duration_minutes ?? rawMeeting.durationMinutes) as number | null;

        // action_items can be a string (from Fireflies) or string[] — normalize
        const actionItems: string[] = Array.isArray(rawActionItems)
          ? rawActionItems
          : typeof rawActionItems === "string" && rawActionItems.trim()
            ? rawActionItems.split("\n").filter((l: string) => l.trim())
            : [];

        // keywords can be a string[] or a string
        const keywords: string[] = Array.isArray(rawKeywords)
          ? rawKeywords
          : typeof rawKeywords === "string" && rawKeywords.trim()
            ? rawKeywords.split(",").map((k: string) => k.trim()).filter(Boolean)
            : [];

        return (
          <div className="mt-0.5 space-y-1.5">
            <span className="text-sm text-muted-foreground">
              {meeting.title ?? "Untitled meeting"}
              {durationMinutes ? ` \u00B7 ${durationMinutes}min` : null}
            </span>
            {aiSummary && (
              <p className="text-xs text-muted-foreground/80 line-clamp-3">{aiSummary}</p>
            )}
            {actionItems.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground">Action items</p>
                <ul className="text-xs text-muted-foreground/80 space-y-0.5 pl-3">
                  {actionItems.slice(0, 5).map((item, i) => (
                    <li key={i} className="list-disc">{item}</li>
                  ))}
                  {actionItems.length > 5 && (
                    <li className="list-none text-[11px]">+{actionItems.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {keywords.slice(0, 8).map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                    {kw}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      }
      case "note": {
        const note = entry.data as Note;
        return (
          <span className="text-sm text-muted-foreground mt-0.5">
            {note.title || truncate(note.content, 100)}
          </span>
        );
      }
      case "task": {
        const task = entry.data as Task;
        return (
          <span className="text-sm text-muted-foreground mt-0.5">
            {task.title}
            {task.completed && (
              <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal">
                Completed
              </Badge>
            )}
          </span>
        );
      }
      case "opportunity_stage_change": {
        const sc = entry.data as OpportunityStageChange;
        return (
          <span className="text-sm text-muted-foreground mt-0.5">
            {sc.fromStageLabel ?? "New"} → {sc.toStageLabel}
            {sc.changedByName && ` · by ${sc.changedByName}`}
          </span>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="flex gap-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{config.label}</span>
          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
