import { createRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePendingDedupCandidates,
  useMergeContacts,
  useDismissCandidate,
} from "@/hooks/use-dedup-candidates";
import type { DedupCandidateContact } from "@crm/shared";
import { ArrowsMergeIcon, XIcon, LinkedinLogoIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { dashboardRoute } from "./dashboard";

export const dedupReviewRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/dedup-review",
  component: DedupReviewPage,
});

function ContactCard({ contact, label }: { contact: DedupCandidateContact; label: string }) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold">{contact.name}</div>
      {contact.title && (
        <div className="text-xs text-muted-foreground">{contact.title}</div>
      )}
      {contact.companyName && (
        <div className="text-xs text-muted-foreground">{contact.companyName}</div>
      )}
      <div className="flex flex-col gap-1 pt-1">
        {contact.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <EnvelopeSimpleIcon size={12} />
            <span className="truncate">{contact.email}</span>
          </div>
        )}
        {contact.linkedinUrl && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LinkedinLogoIcon size={12} />
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:underline"
            >
              {contact.linkedinUrl.replace("https://www.linkedin.com/in/", "")}
            </a>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Badge variant="outline" className="text-[10px]">{contact.source}</Badge>
      </div>
      {contact.aiSummary && (
        <p className="text-xs text-muted-foreground italic pt-1">{contact.aiSummary}</p>
      )}
    </div>
  );
}

function DedupReviewPage() {
  const { data, isLoading } = usePendingDedupCandidates();
  const mergeMutation = useMergeContacts();
  const dismissMutation = useDismissCandidate();
  const candidates = data?.candidates ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Duplicate Review"
        description="Review potential duplicate contacts detected by AI matching"
      />

      <div className="mt-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">No pending duplicate candidates</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run AI classification to detect potential duplicates across your contacts.
            </p>
          </div>
        ) : (
          candidates.map((candidate) => (
            <div
              key={candidate.id}
              className="rounded-lg border border-border bg-background p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {candidate.matchReason}
                  </Badge>
                  {candidate.aiConfidence && (
                    <Badge
                      variant={candidate.aiConfidence === "high" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {candidate.aiConfidence} confidence
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(candidate.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="flex gap-3">
                <ContactCard contact={candidate.contactA} label="Contact A" />
                <ContactCard contact={candidate.contactB} label="Contact B" />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dismissMutation.mutate(candidate.id)}
                  disabled={dismissMutation.isPending || mergeMutation.isPending}
                >
                  <XIcon size={14} className="mr-1.5" />
                  Not a Match
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    mergeMutation.mutate({
                      keepContactId: candidate.contactB.id,
                      mergeContactId: candidate.contactA.id,
                    })
                  }
                  disabled={mergeMutation.isPending || dismissMutation.isPending}
                >
                  <ArrowsMergeIcon size={14} className="mr-1.5" />
                  Merge
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
