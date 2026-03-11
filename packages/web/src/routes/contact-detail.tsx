import { useState } from "react";
import { createRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  PencilSimple,
  Trash,
  SpinnerGap,
  Sparkle,
  EnvelopeSimple,
  Phone,
  LinkedinLogo,
  Plus,
  NoteBlank,
} from "@phosphor-icons/react";
import { CONTACT_PIPELINES, type ContactPipeline, type CompanyPipeline } from "@crm/shared";

import { useContact, useUpdateContact, useDeleteContact } from "@/hooks/use-contacts";
import { useCompany } from "@/hooks/use-companies";
import { useTimeline } from "@/hooks/use-timeline";
import { useCreateNote } from "@/hooks/use-notes";
import { useUsers } from "@/hooks/use-users";
import { useDedupLog, useReviewDedupLog } from "@/hooks/use-dedup-log";
import { useClassificationHistory } from "@/hooks/use-classify";
import { PipelineBadge } from "@/components/funnel-stage-badge";
import { SourceBadge } from "@/components/source-badge";
import { ProductFlags } from "@/components/product-flags";
import { TimelineItem } from "@/components/timeline-item";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { dashboardRoute } from "./dashboard";

export const contactDetailRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/contacts/$id",
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { id } = useParams({ from: contactDetailRoute.id });
  const navigate = useNavigate();

  // ── Data fetching ──
  const { data: contactData, isLoading: contactLoading } = useContact(id);
  const contact = contactData?.contact;
  const owners = contactData?.contact ? (contactData as { contact: { owners?: Array<{ id: string; name: string; avatarUrl: string | null }> } }).contact.owners : undefined;

  const { data: companyData } = useCompany(contact?.companyId ?? "");
  const company = companyData?.company;

  const { data: timelineData } = useTimeline({ contactId: id });
  const timeline = timelineData?.timeline ?? [];

  const { data: usersData } = useUsers();

  const { data: dedupLogData } = useDedupLog(id);
  const unreviewedDedups = (dedupLogData?.logs ?? []).filter((l) => !l.reviewed);

  const { data: classificationHistory } = useClassificationHistory(id);

  // ── Mutations ──
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();
  const createNoteMutation = useCreateNote();
  const reviewDedupMutation = useReviewDedupLog();

  // ── Note input ──
  const [noteContent, setNoteContent] = useState("");

  function handleAddNote() {
    if (!noteContent.trim()) return;
    createNoteMutation.mutate(
      { contactId: id, content: noteContent.trim() },
      { onSuccess: () => setNoteContent("") },
    );
  }

  // ── Edit sheet ──
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editLinkedinUrl, setEditLinkedinUrl] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editPipeline, setEditPipeline] = useState<ContactPipeline | "__inherit__">("__inherit__");

  function openEditSheet() {
    if (!contact) return;
    setEditName(contact.name);
    setEditEmail(contact.email ?? "");
    setEditPhone(contact.phone ?? "");
    setEditTitle(contact.title ?? "");
    setEditLinkedinUrl(contact.linkedinUrl ?? "");
    setEditCompanyId(contact.companyId ?? "");
    setEditPipeline(contact.pipeline ?? "__inherit__");
    setShowEditSheet(true);
  }

  function handleUpdate() {
    if (!editName.trim()) return;
    updateMutation.mutate(
      {
        id,
        data: {
          name: editName.trim(),
          email: editEmail || undefined,
          phone: editPhone || undefined,
          title: editTitle || undefined,
          linkedinUrl: editLinkedinUrl || undefined,
          companyId: editCompanyId || undefined,
          pipeline: (editPipeline === "__inherit__" ? null : editPipeline) as ContactPipeline | null,
        },
      },
      { onSuccess: () => setShowEditSheet(false) },
    );
  }

  // ── Delete dialog ──
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  function handleDelete() {
    deleteMutation.mutate(id, {
      onSuccess: () => navigate({ to: "/contacts", search: { search: "", pipeline: "", visibility: "", ownerId: "", page: 1 } }),
    });
  }

  // ── Loading state ──
  if (contactLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Skeleton className="h-4 w-24 mb-6" />
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-border bg-card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-muted-foreground">Contact not found.</p>
      </div>
    );
  }

  // Get companies list for the edit sheet select
  const allUsers = usersData?.users ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Back link */}
      <Link
        to="/contacts"
        search={{ search: "", pipeline: "", visibility: "", ownerId: "", page: 1 }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Contacts
      </Link>

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold">{contact.name}</h1>
          {contact.title && (
            <p className="text-sm text-muted-foreground mt-0.5">{contact.title}</p>
          )}
          {company && (
            <Link
              to="/companies/$id"
              params={{ id: company.id }}
              className="text-sm text-primary hover:underline mt-0.5 inline-block"
            >
              {company.name}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(contact.pipeline || company?.pipeline) && (
            <PipelineBadge pipeline={(contact.pipeline ?? company?.pipeline)!} />
          )}
          <Button variant="outline" size="sm" onClick={openEditSheet}>
            <PencilSimple size={14} />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash size={14} />
            Delete
          </Button>
        </div>
      </div>

      {/* Dedup merge indicator */}
      {unreviewedDedups.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 p-3 space-y-2">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            AI merged {unreviewedDedups.length === 1 ? "an email" : `${unreviewedDedups.length} emails`} into this contact
          </p>
          {unreviewedDedups.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-2">
              <span className="text-xs text-amber-700 dark:text-amber-300 truncate">
                {log.mergedEmail}
                {log.mergedName ? ` (${log.mergedName})` : ""}
                {" — "}
                {log.matchReason}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-6 text-xs"
                disabled={reviewDedupMutation.isPending}
                onClick={() => reviewDedupMutation.mutate(log.id)}
              >
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Info card */}
      <div className="mt-6 rounded-lg border border-border bg-card divide-y divide-border">
        {contact.email && (
          <div className="flex items-center gap-3 px-4 py-3">
            <EnvelopeSimple size={16} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">Email</span>
            <a
              href={`mailto:${contact.email}`}
              className="text-sm text-primary hover:underline truncate"
            >
              {contact.email}
            </a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-3 px-4 py-3">
            <Phone size={16} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">Phone</span>
            <a
              href={`tel:${contact.phone}`}
              className="text-sm text-primary hover:underline"
            >
              {contact.phone}
            </a>
          </div>
        )}
        {contact.linkedinUrl && (
          <div className="flex items-center gap-3 px-4 py-3">
            <LinkedinLogo size={16} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">LinkedIn</span>
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline truncate"
            >
              {contact.linkedinUrl}
            </a>
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="size-4 shrink-0" />
          <span className="text-xs font-medium text-muted-foreground w-20">Source</span>
          <SourceBadge source={contact.source} />
        </div>
        {(contact.isCanvasUser || contact.isSketchUser || contact.usesServices) && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="size-4 shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">Products</span>
            <ProductFlags
              isCanvasUser={contact.isCanvasUser}
              isSketchUser={contact.isSketchUser}
              usesServices={contact.usesServices}
            />
          </div>
        )}
        {contact.canvasSignupDate && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="size-4 shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">Canvas signup</span>
            <span className="text-sm text-muted-foreground">
              {new Date(contact.canvasSignupDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        )}
      </div>

      {/* Owners */}
      {owners && owners.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Owners</h2>
          <div className="flex items-center gap-3">
            {owners.map((owner) => (
              <div key={owner.id} className="flex items-center gap-2">
                <UserAvatar name={owner.name} avatarUrl={owner.avatarUrl} size="sm" />
                <span className="text-sm">{owner.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Timeline</h2>

        {/* Add note form */}
        <div className="flex gap-2 mb-4">
          <Textarea
            placeholder="Add a note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className="min-h-[60px]"
          />
          <Button
            size="sm"
            className="shrink-0 self-end"
            disabled={!noteContent.trim() || createNoteMutation.isPending}
            onClick={handleAddNote}
          >
            {createNoteMutation.isPending ? (
              <SpinnerGap size={14} className="animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
        </div>

        {/* Timeline entries */}
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No activity yet</p>
        ) : (
          <div className="divide-y divide-border">
            {timeline.map((entry, i) => (
              <TimelineItem key={`${entry.type}-${entry.date}-${i}`} entry={entry} contactName={contact?.name} />
            ))}
          </div>
        )}
      </div>

      {/* Classification History */}
      {classificationHistory && classificationHistory.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkle size={18} className="text-amber-500" />
            Classification History
          </h2>
          <div className="space-y-2">
            {classificationHistory.map((log) => (
              <div key={log.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <PipelineBadge pipeline={(log.previousPipeline ?? "uncategorized") as CompanyPipeline} />
                    {log.pipelineAssigned !== log.previousPipeline && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <PipelineBadge pipeline={(log.pipelineAssigned ?? "uncategorized") as CompanyPipeline} />
                      </>
                    )}
                    {log.confidence && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium border-0">
                        {log.confidence}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(log.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {log.aiSummary && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{log.aiSummary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet open={showEditSheet} onOpenChange={setShowEditSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Contact</SheetTitle>
          </SheetHeader>

          <div className="grid gap-4 px-4 py-2 overflow-y-auto flex-1">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
              <Input
                id="edit-linkedin"
                value={editLinkedinUrl}
                onChange={(e) => setEditLinkedinUrl(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Pipeline</Label>
              <Select value={editPipeline} onValueChange={(v: string) => setEditPipeline(v as ContactPipeline | "__inherit__")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Inherit from company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit__">Inherit from company</SelectItem>
                  {CONTACT_PIPELINES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setShowEditSheet(false)}>
              Cancel
            </Button>
            <Button
              disabled={!editName.trim() || updateMutation.isPending}
              onClick={handleUpdate}
            >
              {updateMutation.isPending ? (
                <>
                  <SpinnerGap size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Contact"
        description={`Are you sure you want to delete "${contact.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
