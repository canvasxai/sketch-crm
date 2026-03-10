import {
  EnvelopeSimple,
  LinkedinLogo,
  CalendarCheck,
  NoteBlank,
  CheckSquare,
  ArrowsLeftRight,
} from "@phosphor-icons/react";
import type { TimelineEntry, Email, LinkedinMessage, Meeting, Note, Task, StageChange } from "@crm/shared";

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
  stage_change: { icon: ArrowsLeftRight, label: "Stage Change" },
};

interface TimelineItemProps {
  entry: TimelineEntry;
}

export function TimelineItem({ entry }: TimelineItemProps) {
  const config = typeConfig[entry.type];
  const Icon = config.icon;

  function renderContent() {
    switch (entry.type) {
      case "email": {
        const email = entry.data as Email;
        return (
          <>
            <span className="text-sm text-muted-foreground mt-0.5">
              {email.subject || "No subject"}
            </span>
            {email.direction && (
              <div className="mt-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  {email.direction === "outbound" ? "Outbound" : "Inbound"}
                </Badge>
              </div>
            )}
          </>
        );
      }
      case "linkedin_message": {
        const msg = entry.data as LinkedinMessage;
        return (
          <>
            <span className="text-sm text-muted-foreground mt-0.5">
              {msg.messageText ? truncate(msg.messageText, 100) : "No message"}
            </span>
            {msg.direction && (
              <div className="mt-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  {msg.direction === "outbound" ? "Outbound" : "Inbound"}
                </Badge>
              </div>
            )}
          </>
        );
      }
      case "meeting": {
        const meeting = entry.data as Meeting;
        return (
          <span className="text-sm text-muted-foreground mt-0.5">
            {meeting.title ?? "Untitled meeting"}
            {meeting.startTime && ` \u00B7 ${formatDate(meeting.startTime)}`}
          </span>
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
      case "stage_change": {
        const sc = entry.data as StageChange;
        return (
          <span className="text-sm text-muted-foreground mt-0.5">
            {sc.fromStage} → {sc.toStage}
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
