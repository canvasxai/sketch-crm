import { ArrowsClockwise } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useSourceStatus } from "@/hooks/use-integrations";

export function SyncStatusBar() {
  const { data: sourceStatus } = useSourceStatus();
  const navigate = useNavigate();

  if (!sourceStatus) return null;

  const gmailSyncing = sourceStatus.gmail.status === "syncing";
  const calendarSyncing = sourceStatus.google_calendar.status === "syncing";
  const linkedinSyncing = sourceStatus.linkedin.status === "syncing";

  if (!gmailSyncing && !calendarSyncing && !linkedinSyncing) return null;

  let statusText = "";
  if (gmailSyncing) {
    statusText = `Gmail syncing... ${sourceStatus.gmail.emailsSynced.toLocaleString()} emails processed`;
  } else if (linkedinSyncing) {
    statusText = `LinkedIn syncing... ${sourceStatus.linkedin.leadsSynced.toLocaleString()} leads processed`;
  } else if (calendarSyncing) {
    statusText = `Calendar syncing... ${sourceStatus.google_calendar.eventsSynced.toLocaleString()} events processed`;
  }

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/import" })}
      className="flex w-full items-center justify-center gap-2 bg-primary/5 border-b border-primary/10 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
    >
      <ArrowsClockwise size={14} className="animate-spin" />
      {statusText}
      <span className="text-primary/60">View</span>
    </button>
  );
}
