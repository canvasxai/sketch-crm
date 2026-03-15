import { useState } from "react";
import { ArrowsClockwise, ListChecks, SpinnerGap } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useNeedsReviewCount } from "@/hooks/use-classify";
import { useDedupCandidateCount } from "@/hooks/use-dedup-candidates";
import { useSourceStatus, useCancelAimfoxBackfill, useCancelGmailSync, useCancelFirefliesSync } from "@/hooks/use-integrations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SyncStatusBar() {
  const { data: sourceStatus } = useSourceStatus();
  const { data: dedupCount } = useDedupCandidateCount();
  const { data: reviewCount } = useNeedsReviewCount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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
    <>
      <div className="flex w-full items-center justify-center gap-3 bg-primary/5 border-b border-primary/10 py-1.5 text-xs text-primary">
        {isSyncing && (
          <button
            type="button"
            className="flex items-center gap-2 hover:underline"
            onClick={() => setOpen(true)}
          >
            <ArrowsClockwise size={14} className="animate-spin" />
            {statusText}
          </button>
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

      <SyncProgressDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function SyncProgressDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: sourceStatus } = useSourceStatus({ fastPoll: true });
  const cancelGmail = useCancelGmailSync();
  const cancelAimfox = useCancelAimfoxBackfill();
  const cancelFireflies = useCancelFirefliesSync();

  const gmailSyncing = sourceStatus?.gmail.status === "syncing";
  const calendarSyncing = sourceStatus?.google_calendar.status === "syncing";
  const linkedinSyncing = sourceStatus?.linkedin.status === "syncing";
  const firefliesSyncing = sourceStatus?.fireflies?.status === "syncing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sync Progress</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* LinkedIn */}
          {linkedinSyncing && sourceStatus?.linkedin && (
            <SyncSourceCard
              label="LinkedIn"
              stats={[
                { label: "Leads processed", value: sourceStatus.linkedin.leadsSynced },
                { label: "Contacts created", value: sourceStatus.linkedin.contactsCreated },
                { label: "Companies created", value: sourceStatus.linkedin.companiesCreated },
                { label: "Pages fetched", value: sourceStatus.linkedin.pagesFetched },
              ]}
              error={sourceStatus.linkedin.errorMessage}
              onCancel={() => cancelAimfox.mutate()}
              cancelling={cancelAimfox.isPending}
            />
          )}

          {/* Gmail */}
          {gmailSyncing && sourceStatus?.gmail && (
            <SyncSourceCard
              label="Gmail"
              stats={[
                { label: "Emails synced", value: sourceStatus.gmail.emailsSynced },
                { label: "Contacts created", value: sourceStatus.gmail.contactsCreated },
                { label: "Companies created", value: sourceStatus.gmail.companiesCreated },
              ]}
              error={sourceStatus.gmail.errorMessage}
              onCancel={() => cancelGmail.mutate()}
              cancelling={cancelGmail.isPending}
            />
          )}

          {/* Calendar */}
          {calendarSyncing && sourceStatus?.google_calendar && (
            <SyncSourceCard
              label="Google Calendar"
              stats={[
                { label: "Events synced", value: sourceStatus.google_calendar.eventsSynced },
                { label: "Contacts created", value: sourceStatus.google_calendar.contactsCreated },
                { label: "Meetings created", value: sourceStatus.google_calendar.meetingsCreated },
              ]}
              error={sourceStatus.google_calendar.errorMessage}
            />
          )}

          {/* Fireflies */}
          {firefliesSyncing && sourceStatus?.fireflies && (
            <SyncSourceCard
              label="Fireflies"
              stats={[
                { label: "Transcripts synced", value: sourceStatus.fireflies.transcriptsSynced },
                { label: "Meetings created", value: sourceStatus.fireflies.meetingsCreated },
                { label: "Contacts matched", value: sourceStatus.fireflies.contactsMatched },
              ]}
              error={sourceStatus.fireflies.errorMessage}
              onCancel={() => cancelFireflies.mutate()}
              cancelling={cancelFireflies.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SyncSourceCard({
  label,
  stats,
  error,
  onCancel,
  cancelling,
}: {
  label: string;
  stats: { label: string; value: number }[];
  error?: string | null;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SpinnerGap size={16} className="animate-spin text-primary" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={onCancel}
            disabled={cancelling}
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-sm font-medium tabular-nums">{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
