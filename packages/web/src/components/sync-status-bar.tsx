import { ArrowsClockwise, ListChecks } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useNeedsReviewCount } from "@/hooks/use-classify";
import { useDedupCandidateCount } from "@/hooks/use-dedup-candidates";
import { useSourceStatus } from "@/hooks/use-integrations";

export function SyncStatusBar() {
  const { data: sourceStatus } = useSourceStatus();
  const { data: dedupCount } = useDedupCandidateCount();
  const { data: reviewCount } = useNeedsReviewCount();
  const navigate = useNavigate();

  const gmailSyncing = sourceStatus?.gmail.status === "syncing";
  const calendarSyncing = sourceStatus?.google_calendar.status === "syncing";
  const linkedinSyncing = sourceStatus?.linkedin.status === "syncing";
  const firefliesSyncing = sourceStatus?.fireflies?.status === "syncing";
  const isSyncing = gmailSyncing || calendarSyncing || linkedinSyncing || firefliesSyncing;

  const pendingDedups = dedupCount?.count ?? 0;
  const totalReview = pendingDedups + (reviewCount ?? 0);

  if (!isSyncing && totalReview === 0) return null;

  let statusText = "";
  if (gmailSyncing) {
    statusText = `Gmail syncing... ${sourceStatus!.gmail.emailsSynced.toLocaleString()} emails processed`;
  } else if (linkedinSyncing) {
    statusText = `LinkedIn syncing... ${sourceStatus!.linkedin.leadsSynced.toLocaleString()} leads processed`;
  } else if (calendarSyncing) {
    statusText = `Calendar syncing... ${sourceStatus!.google_calendar.eventsSynced.toLocaleString()} events processed`;
  } else if (firefliesSyncing) {
    statusText = `Fireflies syncing... ${sourceStatus!.fireflies.transcriptsSynced.toLocaleString()} transcripts processed`;
  }

  return (
    <div className="flex w-full items-center justify-center gap-3 bg-primary/5 border-b border-primary/10 py-1.5 text-xs text-primary">
      {isSyncing && (
        <span className="flex items-center gap-2">
          <ArrowsClockwise size={14} className="animate-spin" />
          {statusText}
        </span>
      )}
      {isSyncing && totalReview > 0 && (
        <span className="text-border">|</span>
      )}
      {totalReview > 0 && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 hover:underline"
          onClick={() => navigate({ to: "/directory", search: { tab: "review", search: "", category: "", visibility: "", ownerId: "", page: 1, open: "" } })}
        >
          <ListChecks size={14} />
          {totalReview} item{totalReview !== 1 ? "s" : ""} need review
        </button>
      )}
    </div>
  );
}
