import {
  COMPANY_PIPELINES,
  type CompanyPipeline,
  CONTACT_PIPELINES,
  CONTACT_SOURCES,
  CONTACT_VISIBILITIES,
  type Contact,
  type ContactSource,
  type ContactPipeline,
  type ContactVisibility,
  isPersonalEmailDomain,
} from "@crm/shared";
import {
  ArrowLeft,
  ArrowsClockwise,
  CalendarBlank,
  CalendarCheck,
  CaretDown,
  ChatCircleDots,
  Check,
  CheckSquare,
  Clock,
  DotsThree,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Binoculars,
  FunnelSimple,
  LinkedinLogo,
  ListChecks,
  MagnifyingGlass,
  NoteBlank,
  NotePencil,
  PencilSimple,
  Phone,
  Plus,
  SignIn,
  SlackLogo,
  SpinnerGap,
  Storefront,
  Trash,
  UploadSimple,
  Users,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { createRoute, useNavigate } from "@tanstack/react-router";
/**
 * Contacts page — unified contact management.
 *
 * Layout (top to bottom):
 * 1. Header — title + stats + "Import CSV" + "Add Contact" buttons
 * 2. Toolbar — search + stage/visibility/owner filter dropdowns + batch actions
 * 3. Contact table — multi-select, badges, detail sheet
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DOMPurify from "dompurify";
import { EmptyState } from "@/components/empty-state";
import { PipelineSelector } from "@/components/pipeline-selector";
import { WorkflowStatusIcon } from "@/components/workflow-status-icon";
import { MultiFilterPopover } from "@/components/multi-filter-popover";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { useCompanies, useUpdateCompany } from "@/hooks/use-companies";
import {
  useBatchDeleteContacts,
  useBatchUpdateContacts,
  useContactCounts,
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from "@/hooks/use-contacts";
import { ClassificationPopover } from "@/components/classification-popover";
import { useCreateNote } from "@/hooks/use-notes";
import { useDedupContactIds } from "@/hooks/use-dedup-candidates";
import { useAddMutedDomain } from "@/hooks/use-settings";
import { useUsers } from "@/hooks/use-users";
import { useTimeline } from "@/hooks/use-timeline";
import { ResizableDrawerWrapper } from "@/components/resizable-drawer-wrapper";
import { useTasks, useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { useCreateMeeting, useCreateEmail } from "@/hooks/use-meetings";
import { useContactsNextUp, useContactsLastTouched } from "@/hooks/use-insights";
import { mapTimelineEntry } from "@/lib/timeline-mapper";
import { timelineEventConfig } from "@/lib/drawer-event-config";
import { formatRelativeDate, formatTime, groupByDate, drawerPipelineStyle, drawerSourceLabel, drawerChannelLabel } from "@/lib/drawer-helpers";
import {
  type DrawerTimelineEventType,
  type DrawerTimelineEvent,
  type DrawerTab,
  type TimelineFilter,
  type LeadChannel,
  EDITABLE_EVENT_TYPES,
  TIMELINE_FILTERS,
  filterToTypes,
} from "@/lib/drawer-types";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

// ── Route ──

export const contactsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/contacts",
  component: ContactsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    search: (search.search as string) || "",
    pipeline: (search.pipeline as string) || "",
    visibility: (search.visibility as string) || "",
    ownerId: (search.ownerId as string) || "",
    page: Number(search.page) || 1,
  }),
});

// ── URL param helpers for multi-select (comma-separated) ──

function parseMulti(raw: string): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").filter(Boolean));
}

function serializeMulti(set: Set<string>): string {
  return [...set].join(",");
}

// ── Helpers ──

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Normalize plain-text email bodies for display: strip \r, collapse excessive blank lines. */
function normalizeBody(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Main component ──

function ContactsPage() {
  const navigate = useNavigate({ from: contactsRoute.fullPath });
  const { search: searchParam, pipeline, visibility, ownerId, page } = contactsRoute.useSearch();

  // ── Multi-select filter state (hydrated from URL params) ──
  const stageFilters = useMemo(() => parseMulti(pipeline), [pipeline]);
  const visibilityFilters = useMemo(() => parseMulti(visibility), [visibility]);
  const ownerFilters = useMemo(() => parseMulti(ownerId), [ownerId]);

  // ── Search state (local for debounce) ──
  const [searchInput, setSearchInput] = useState(searchParam);
  const [debouncedSearch, setDebouncedSearch] = useState(searchParam);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      navigate({
        search: (prev) => ({ ...prev, search: searchInput || "", page: 1 }),
        replace: true,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, navigate]);

  // ── Company lookup ──
  const { data: companiesData } = useCompanies({ limit: 500 });
  const companyMap = useMemo(
    () => new Map((companiesData?.companies ?? []).map((c) => [c.id, c.name])),
    [companiesData],
  );
  const companies = companiesData?.companies ?? [];

  // ── User lookup (for owner column) ──
  const { data: usersData } = useUsers();
  const users = usersData?.users ?? [];
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as [string, string])),
    [users],
  );

  // ── Contact counts ──
  const { data: countsData } = useContactCounts();
  const totalCount = countsData?.total ?? 0;
  const sharedCount = countsData?.visibilityCounts?.shared ?? 0;

  // ── Contact query (fetch all, filter client-side for multi-select) ──
  const { data, isLoading } = useContacts({
    search: debouncedSearch || undefined,
    limit: 500,
  });

  const allContacts = data?.contacts ?? [];

  // ── Client-side multi-select filtering ──
  const filteredContacts = useMemo(() => {
    return allContacts.filter((c) => {
      if (stageFilters.size > 0 && !stageFilters.has(c.pipeline ?? "")) return false;
      if (visibilityFilters.size > 0 && !visibilityFilters.has(c.visibility)) return false;
      if (ownerFilters.size > 0) {
        const ownerIds = (c.owners ?? []).map((o) => o.id);
        if (ownerIds.length === 0 || !ownerIds.some((id) => ownerFilters.has(id))) return false;
      }
      return true;
    });
  }, [allContacts, stageFilters, visibilityFilters, ownerFilters]);

  // ── Client-side pagination ──
  const limit = 20;
  const offset = (page - 1) * limit;
  const total = filteredContacts.length;
  const contacts = filteredContacts.slice(offset, offset + limit);

  // ── Batch insights for current page ──
  const contactIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const { data: nextUpData } = useContactsNextUp(contactIds);
  const { data: lastTouchedData } = useContactsLastTouched(contactIds);

  // ── Dedup awareness ──
  const { data: dedupContactIds } = useDedupContactIds();
  const dedupIds = dedupContactIds ?? new Set<string>();

  // ── Selection mode (toggleable) ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [data]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  }

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0;

  // ── Batch operations ──
  const batchUpdateMutation = useBatchUpdateContacts();
  const batchDeleteMutation = useBatchDeleteContacts();

  function handlePromoteToShared() {
    batchUpdateMutation.mutate(
      { ids: [...selected], visibility: "shared" },
      { onSuccess: () => setSelected(new Set()) },
    );
  }

  function handleBatchDelete() {
    batchDeleteMutation.mutate([...selected], {
      onSuccess: () => setSelected(new Set()),
    });
  }

  // ── Detail sheet ──
  const [detailContact, setDetailContact] = useState<Contact | null>(null);

  // ── Add dialog ──
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactSource, setContactSource] = useState("");
  const [contactPipeline, setContactPipeline] = useState<ContactPipeline | null>(null);

  const createMutation = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const updateCompanyMutation = useUpdateCompany();
  const canSubmit = name.trim() && contactSource;

  // ── Pipeline propagation prompt ──
  // When a user manually changes a contact's pipeline, ask whether to also update the company
  const [pipelinePrompt, setPipelinePrompt] = useState<{
    contactName: string;
    companyId: string;
    companyName: string;
    companyCurrentPipeline: string;
    newPipeline: string;
  } | null>(null);

  function handleContactPipelineChange(contact: Contact, newPipeline: string | null) {
    // Always update the contact first
    updateContactMutation.mutate({
      id: contact.id,
      data: { pipeline: newPipeline as ContactPipeline | null },
    });

    // If the contact has a company and a pipeline was selected (not cleared),
    // ask whether to also update the company
    if (newPipeline && contact.companyId) {
      const company = companies.find((c) => c.id === contact.companyId);
      if (company && company.pipeline !== newPipeline) {
        setPipelinePrompt({
          contactName: contact.name,
          companyId: company.id,
          companyName: company.name,
          companyCurrentPipeline: company.pipeline,
          newPipeline,
        });
      }
    }
  }

  function resetAndClose() {
    setName("");
    setEmail("");
    setPhone("");
    setTitle("");
    setLinkedinUrl("");
    setCompanyId("");
    setContactSource("");
    setContactPipeline(null);
    setShowAddDialog(false);
  }

  function handleCreate() {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        name: name.trim(),
        source: contactSource as ContactSource,
        pipeline: contactPipeline,
        ...(email && { email }),
        ...(phone && { phone }),
        ...(title && { title }),
        ...(linkedinUrl && { linkedinUrl }),
        ...(companyId && { companyId }),
      },
      { onSuccess: resetAndClose },
    );
  }

  // ── Pagination helpers ──
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const hasPrev = page > 1;
  const hasNext = offset + limit < total;

  // ── Filter navigation helpers (multi-select) ──
  function setStageFilters(next: Set<string>) {
    navigate({
      search: (prev) => ({ ...prev, pipeline: serializeMulti(next), page: 1 }),
      replace: true,
    });
  }

  function setVisibilityFiltersNav(next: Set<string>) {
    navigate({
      search: (prev) => ({ ...prev, visibility: serializeMulti(next), page: 1 }),
      replace: true,
    });
  }

  function setOwnerFiltersNav(next: Set<string>) {
    navigate({
      search: (prev) => ({ ...prev, ownerId: serializeMulti(next), page: 1 }),
      replace: true,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your CRM contacts — review, filter, and organize.</p>
        </div>
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{totalCount} total</span>
              {sharedCount > 0 && (
                <>
                  <span className="text-border">|</span>
                  <span>{sharedCount} shared</span>
                </>
              )}
            </div>
          )}
          <ClassificationPopover />
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus size={16} />
            Add Contact
          </Button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="mt-5 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <MultiFilterPopover
          label="All pipelines"
          options={COMPANY_PIPELINES.map((s: CompanyPipeline) => ({
            value: s,
            label: s.charAt(0).toUpperCase() + s.slice(1),
          }))}
          selected={stageFilters}
          onChange={setStageFilters}
        />

        <MultiFilterPopover
          label="All visibility"
          options={CONTACT_VISIBILITIES.map((v) => ({
            value: v,
            label: v.charAt(0).toUpperCase() + v.slice(1),
          }))}
          selected={visibilityFilters}
          onChange={setVisibilityFiltersNav}
        />

        <MultiFilterPopover
          label="All owners"
          options={users.map((u) => ({
            value: u.id,
            label: u.name,
          }))}
          selected={ownerFilters}
          onChange={setOwnerFiltersNav}
        />

        <Button
          size="sm"
          variant={selectionMode ? "secondary" : "ghost"}
          className="h-8 text-xs gap-1 ml-auto"
          onClick={() => {
            setSelectionMode((prev) => !prev);
            setSelected(new Set());
          }}
        >
          <ListChecks size={14} />
          Select
        </Button>

        {selectionMode && someSelected && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={handlePromoteToShared}
              disabled={batchUpdateMutation.isPending}
            >
              <Eye size={14} />
              Promote {selected.size} to shared
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
              onClick={handleBatchDelete}
              disabled={batchDeleteMutation.isPending}
            >
              <Trash size={14} />
              Delete {selected.size}
            </Button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Users size={32} />}
            title="No contacts yet"
            description="Add your first contact, import from CSV, or connect Gmail to get started."
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus size={16} />
                  Add Contact
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/import" })}>
                  <UploadSimple size={16} />
                  Import Data
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-border bg-card">
            {/* Table header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="w-5">
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="size-3.5 rounded border-border accent-primary cursor-pointer"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-32">Domain</div>
              <div className="w-24">Pipeline</div>
              <div className="w-20">Owner</div>
              <div className="w-44">Next up</div>
              <div className="w-28">Last touched</div>
            </div>

            {/* Table rows */}
            {contacts.map((contact) => {
              const isSelected = selected.has(contact.id);
              const subtitle = [contact.title, contact.companyId ? companyMap.get(contact.companyId) : null].filter(Boolean).join(" \u00B7 ");
              const nextUp = nextUpData?.[contact.id] ?? { type: "none" as const, label: "\u2014" };
              const lastTouched = lastTouchedData?.[contact.id];
              const domain = contact.email?.split("@")[1] ?? null;

              return (
                <div
                  key={contact.id}
                  className={cn(
                    "group flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-b-0 cursor-pointer",
                    selectionMode && isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                  )}
                >
                  <div className="w-5" onClick={(e) => e.stopPropagation()}>
                    {selectionMode ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(contact.id)}
                        className="size-3.5 rounded border-border accent-primary cursor-pointer"
                      />
                    ) : (
                      <WorkflowStatusIcon
                        contact={contact}
                        dedupContactIds={dedupIds}
                        onClick={(status) => {
                          if (status === "dedup") {
                            navigate({ to: "/dedup-review" });
                          }
                        }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => setDetailContact(contact)}>
                    <div className="text-sm font-medium truncate">{contact.name}</div>
                    {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
                  </div>
                  <div className="w-32 text-xs text-muted-foreground truncate" onClick={() => setDetailContact(contact)}>
                    {domain ?? "\u2014"}
                  </div>
                  <div className="w-24" onClick={(e) => e.stopPropagation()}>
                    <PipelineSelector
                      value={contact.pipeline}
                      options={CONTACT_PIPELINES}
                      allowClear
                      onChange={(p) => handleContactPipelineChange(contact, p)}
                    />
                  </div>
                  <div className="w-20 text-xs text-muted-foreground truncate" onClick={() => setDetailContact(contact)}>
                    {(contact.owners ?? []).length > 0
                      ? contact.owners!.map((o) => o.name.split(" ")[0]).join(", ")
                      : "\u2014"}
                  </div>
                  <div className="w-44 truncate" onClick={() => setDetailContact(contact)}>
                    {nextUp.type === "none" ? (
                      <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                    ) : (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        nextUp.isOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                      )}>
                        {nextUp.type === "meeting" && <span>📅</span>}
                        {nextUp.type === "task" && <span>✅</span>}
                        {nextUp.type === "reply_needed" && <span>📧</span>}
                        <span className="truncate">{nextUp.label}</span>
                      </span>
                    )}
                  </div>
                  <div className="w-28 text-xs text-muted-foreground" onClick={() => setDetailContact(contact)}>
                    {lastTouched?.label ?? "\u2014"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {from}&ndash;{to} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() =>
                  navigate({
                    search: (prev) => ({ ...prev, page: page - 1 }),
                    replace: true,
                  })
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() =>
                  navigate({
                    search: (prev) => ({ ...prev, page: page + 1 }),
                    replace: true,
                  })
                }
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Detail Sheet ── */}
      <Sheet
        open={!!detailContact}
        onOpenChange={(open) => {
          if (!open) setDetailContact(null);
        }}
      >
        <SheetContent className="!w-auto !max-w-none p-0" showCloseButton={false}>
          {detailContact && (
            <ResizableDrawerWrapper>
              <ContactDetailDrawer
                contact={detailContact}
                companyName={detailContact.companyId ? (companyMap.get(detailContact.companyId) ?? null) : null}
                onClose={() => setDetailContact(null)}
              />
            </ResizableDrawerWrapper>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Pipeline Propagation Prompt ── */}
      <Dialog open={!!pipelinePrompt} onOpenChange={(open) => { if (!open) setPipelinePrompt(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update company pipeline?</DialogTitle>
            <DialogDescription>
              You changed <strong>{pipelinePrompt?.contactName}</strong>'s pipeline.
              Should <strong>{pipelinePrompt?.companyName}</strong> and all its contacts also be updated
              to <strong>{pipelinePrompt?.newPipeline}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelinePrompt(null)}>
              No, keep as is
            </Button>
            <Button
              onClick={() => {
                if (pipelinePrompt) {
                  updateCompanyMutation.mutate({
                    id: pipelinePrompt.companyId,
                    data: {
                      pipeline: pipelinePrompt.newPipeline as CompanyPipeline,
                      propagateToContacts: true,
                    },
                  });
                }
                setPipelinePrompt(null);
              }}
            >
              Yes, update company &amp; contacts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Contact Dialog ── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Create a new contact record in your CRM.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input id="contact-name" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-title">Title</Label>
              <Input
                id="contact-title"
                placeholder="VP of Engineering"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-linkedin">LinkedIn URL</Label>
              <Input
                id="contact-linkedin"
                placeholder="https://linkedin.com/in/janedoe"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Source *</Label>
              <Select value={contactSource} onValueChange={setContactSource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Pipeline</Label>
              <Select value={contactPipeline ?? ""} onValueChange={(v: string) => setContactPipeline(v === "" ? null : (v as ContactPipeline))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Inherit from company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Inherit from company</SelectItem>
                  {COMPANY_PIPELINES.map((p: CompanyPipeline) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={resetAndClose}>
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={!canSubmit || createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Contact"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}




/* ─────────────────────────────────────────────────────────
 * ContactDetailDrawer — redesigned single-scroll layout
 * ───────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────
 * ContactDetailDrawer — redesigned single-scroll layout
 * ───────────────────────────────────────────────────────── */

export function ContactDetailDrawer({
  contact,
  companyName,
  onClose,
  onBack,
}: {
  contact: Contact;
  companyName: string | null;
  onClose: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(contact.name);
  const [editTitle, setEditTitle] = useState(contact.title ?? "");
  const [editEmails, setEditEmails] = useState(contact.email ?? "");
  const [editPhones, setEditPhones] = useState(contact.phone ?? "");
  const [editLinkedin, setEditLinkedin] = useState(contact.linkedinUrl ?? "");

  // Stage & channel
  const [currentStage, setCurrentStage] = useState(contact.pipeline ?? "uncategorized");
  const leadChannel = (contact as Contact & { leadChannel?: LeadChannel | null }).leadChannel ?? null;

  // Tabs & view stack
  const [activeTab, setActiveTab] = useState<DrawerTab>("context");
  type DrawerView = "default" | "email" | "note" | "meeting";
  const [drawerView, setDrawerView] = useState<DrawerView>("default");
  const [noteContent, setNoteContent] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [meetTitle, setMeetTitle] = useState("");
  const [meetDate, setMeetDate] = useState("");
  const [meetLocation, setMeetLocation] = useState("");
  // To-do form
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  // Timeline
  const [activeFilters, setActiveFilters] = useState<Set<TimelineFilter>>(new Set());
  // Expanded & editing timeline items
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState("");
  const [editingEventDescription, setEditingEventDescription] = useState("");

  function toggleEventExpanded(eventId: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  // Dialogs
  const [showVendorConfirm, setShowVendorConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset state when a different contact opens
  const prevContactId = useRef(contact.id);
  if (contact.id !== prevContactId.current) {
    prevContactId.current = contact.id;
    setCurrentStage(contact.pipeline ?? "uncategorized");
    setIsEditing(false);
    setEditName(contact.name);
    setEditTitle(contact.title ?? "");
    setEditEmails(contact.email ?? "");
    setEditPhones(contact.phone ?? "");
    setEditLinkedin(contact.linkedinUrl ?? "");
    setDrawerView("default");
    setActiveTab("context");
    setNoteContent("");
    setNoteDate("");
    setNewTaskTitle("");
    setNewTaskAssignee("");
    setNewTaskDueDate("");
    setActiveFilters(new Set());
    setExpandedEvents(new Set());
    setEditingEventId(null);
    setShowVendorConfirm(false);
    setShowDeleteConfirm(false);
  }

  // Real timeline data
  const { data: timelineData } = useTimeline({ contactId: contact.id });
  const realTimeline = useMemo(
    () => (timelineData?.timeline ?? []).map((e) => mapTimelineEntry(e, contact.name)),
    [timelineData, contact.name],
  );

  // Real tasks
  const { data: tasksData } = useTasks({ contactId: contact.id });
  const contactTasks = tasksData?.tasks ?? [];

  // Users (for assignee picker)
  const { data: usersData } = useUsers();
  const allUsers = usersData?.users ?? [];

  // Mutations
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();
  const addMutedDomainMutation = useAddMutedDomain();
  const createNoteMutation = useCreateNote();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const createEmailMutation = useCreateEmail();
  const createMeetingMutation = useCreateMeeting();

  const emailDomain = contact.email?.split("@")[1] ?? null;

  // Filter timeline
  const filteredTimeline = useMemo(() => {
    if (activeFilters.size === 0) return realTimeline;
    const allowedTypes = new Set<DrawerTimelineEventType>();
    for (const filter of activeFilters) {
      const types = filterToTypes[filter];
      if (types) for (const t of types) allowedTypes.add(t);
    }
    return realTimeline.filter((e) => allowedTypes.has(e.type));
  }, [realTimeline, activeFilters]);

  const groupedTimeline = useMemo(() => groupByDate(filteredTimeline), [filteredTimeline]);

  function toggleFilter(filter: TimelineFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (filter === "all") return new Set(); // "All" clears filters
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }

  // Handlers

  function handlePipelineChange(value: string) {
    setCurrentStage(value);
    updateMutation.mutate({
      id: contact.id,
      data: { pipeline: (value as ContactPipeline) || null },
    });
  }

  function handleSaveEdit() {
    const primaryEmail = editEmails.split(",").map((e) => e.trim()).find((e) => e) || undefined;
    const primaryPhone = editPhones.split(",").map((p) => p.trim()).find((p) => p) || undefined;
    updateMutation.mutate(
      {
        id: contact.id,
        data: {
          name: editName.trim(),
          title: editTitle.trim() || undefined,
          email: primaryEmail || undefined,
          phone: primaryPhone || undefined,
          linkedinUrl: editLinkedin.trim() || undefined,
          // TODO: send full emails/phones arrays when backend supports it
        },
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleCancelEdit() {
    setEditName(contact.name);
    setEditTitle(contact.title ?? "");
    setEditEmails(contact.email ?? "");
    setEditPhones(contact.phone ?? "");
    setEditLinkedin(contact.linkedinUrl ?? "");
    setIsEditing(false);
  }

  function handleAddNote() {
    if (!noteContent.trim()) return;
    createNoteMutation.mutate(
      { contactId: contact.id, content: noteContent.trim() },
      {
        onSuccess: () => {
          setNoteContent("");
          setNoteDate("");
          setDrawerView("default");
        },
      },
    );
  }

  function goBack() {
    setDrawerView("default");
  }

  function handleMarkAsVendor() {
    if (!emailDomain) return;
    addMutedDomainMutation.mutate(
      { domain: emailDomain },
      {
        onSuccess: () => {
          setShowVendorConfirm(false);
          onClose();
        },
      },
    );
  }

  function handleDelete() {
    deleteMutation.mutate(contact.id, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        onClose();
      },
    });
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={12} />
              Back to company
            </button>
          )}
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 pr-4">
              {/* Name */}
              {isEditing ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full truncate border-0 border-b border-dashed border-border bg-transparent text-lg font-bold outline-none focus:border-primary"
                  placeholder="Name"
                  autoFocus
                />
              ) : (
                <h2 className="truncate text-lg font-bold">{contact.name}</h2>
              )}

              {/* Title */}
              {isEditing ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full truncate border-0 border-b border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none focus:border-primary"
                  placeholder="Job title"
                />
              ) : (
                (contact.title || companyName) && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {[contact.title, companyName].filter(Boolean).join(" \u00B7 ")}
                  </p>
                )
              )}

              {/* Contact fields */}
              <div className="mt-1.5 flex flex-col gap-0.5">
                {/* Emails */}
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <EnvelopeSimple size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      value={editEmails}
                      onChange={(e) => setEditEmails(e.target.value)}
                      className="min-w-0 flex-1 border-0 border-b border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none focus:border-primary focus:text-foreground"
                      placeholder="Emails (comma separated)"
                    />
                  </div>
                ) : (
                  contact.email && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-w-full">
                            <EnvelopeSimple size={13} className="shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </a>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{contact.email}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                )}

                {/* Phones */}
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Phone size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      value={editPhones}
                      onChange={(e) => setEditPhones(e.target.value)}
                      className="min-w-0 flex-1 border-0 border-b border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none focus:border-primary focus:text-foreground"
                      placeholder="Phones (comma separated)"
                    />
                  </div>
                ) : (
                  contact.phone && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-w-full">
                            <Phone size={13} className="shrink-0" />
                            <span className="truncate">{contact.phone}</span>
                          </a>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{contact.phone}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                )}

                {/* LinkedIn */}
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <LinkedinLogo size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      value={editLinkedin}
                      onChange={(e) => setEditLinkedin(e.target.value)}
                      className="min-w-0 flex-1 border-0 border-b border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none focus:border-primary focus:text-foreground"
                      placeholder="LinkedIn URL"
                    />
                  </div>
                ) : (
                  contact.linkedinUrl && (
                    <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-w-full">
                      <LinkedinLogo size={13} className="shrink-0" />
                      <span className="truncate">LinkedIn</span>
                    </a>
                  )
                )}
              </div>
            </div>

            {/* Header actions */}
            <div className="flex items-center gap-1">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!editName.trim() || updateMutation.isPending}
                    className="rounded-sm p-1 text-green-600 transition-opacity hover:opacity-80 disabled:opacity-40"
                    title="Save"
                  >
                    {updateMutation.isPending ? <SpinnerGap size={15} className="animate-spin" /> : <Check size={15} weight="bold" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-sm p-1 text-muted-foreground transition-opacity hover:text-foreground"
                    title="Cancel"
                  >
                    <X size={15} weight="bold" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <PencilSimple size={15} />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80"
                        title="Add activity"
                      >
                        <Plus size={12} weight="bold" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => { setActiveTab("activity"); setDrawerView("email"); }}>
                        <EnvelopeSimple size={14} className="mr-2" />
                        Email
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setActiveTab("activity"); setDrawerView("note"); }}>
                        <NoteBlank size={14} className="mr-2" />
                        Note
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setActiveTab("activity"); setDrawerView("meeting"); }}>
                        <CalendarBlank size={14} className="mr-2" />
                        Meeting
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
                      >
                        <DotsThree size={18} weight="bold" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setIsEditing(true)}>
                        <PencilSimple size={14} className="mr-2" />
                        Edit contact info
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <MagnifyingGlass size={14} className="mr-2" />
                        Research on LinkedIn
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <ArrowsClockwise size={14} className="mr-2" />
                        Get latest LinkedIn activity
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          navigate({
                            to: "/contacts/$id",
                            params: { id: contact.id },
                          })
                        }
                      >
                        <Users size={14} className="mr-2" />
                        Merge with another contact
                      </DropdownMenuItem>
                      {emailDomain && !isPersonalEmailDomain(emailDomain) && (
                        <DropdownMenuItem onClick={() => setShowVendorConfirm(true)}>
                          <Storefront size={14} className="mr-2" />
                          Mute domain
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash size={14} className="mr-2" />
                        Delete contact
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <SheetClose className="rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden">
                    <X size={16} />
                    <span className="sr-only">Close</span>
                  </SheetClose>
                </>
              )}
            </div>
          </div>

          {/* Pipeline chip */}
          {!isEditing && (
            <div className="mt-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      drawerPipelineStyle((currentStage || "uncategorized") as CompanyPipeline),
                    )}
                  >
                    {(currentStage || "uncategorized").charAt(0).toUpperCase() + (currentStage || "uncategorized").slice(1)}
                    <CaretDown size={10} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[120px]">
                  {COMPANY_PIPELINES.map((p: CompanyPipeline) => (
                    <DropdownMenuItem
                      key={p}
                      onClick={() => handlePipelineChange(p)}
                      className={currentStage === p ? "bg-accent" : ""}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* ── View Stack ── */}
        {drawerView !== "default" ? (
          /* ── Compose Views (Email / Note / Meeting) ── */
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Compose header */}
            <div className="flex items-center gap-3 border-t border-border px-6 py-3">
              <button
                type="button"
                onClick={goBack}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft size={16} />
              </button>
              <span className="text-sm font-medium">
                {drawerView === "email" && "Send Email"}
                {drawerView === "note" && "Add Note"}
                {drawerView === "meeting" && "Schedule Meeting"}
              </span>
            </div>

            {/* Compose body */}
            <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
              {drawerView === "email" && (
                <div className="flex flex-1 flex-col space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="shrink-0">To:</span>
                    <span className="truncate font-medium text-foreground">{contact.email ?? "No email"}</span>
                  </div>
                  <Input
                    placeholder="Subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="text-sm"
                    autoFocus
                  />
                  <Textarea
                    placeholder="Write your email..."
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="flex-1 min-h-[120px] text-sm resize-none"
                  />
                </div>
              )}

              {drawerView === "note" && (
                <div className="flex flex-1 flex-col space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={noteDate}
                      onChange={(e) => setNoteDate(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <Textarea
                    placeholder="Write a note..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="flex-1 min-h-[120px] text-sm resize-none"
                    autoFocus
                  />
                </div>
              )}

              {drawerView === "meeting" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <Input
                      placeholder="Meeting title"
                      value={meetTitle}
                      onChange={(e) => setMeetTitle(e.target.value)}
                      className="mt-1 text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={meetDate}
                      onChange={(e) => setMeetDate(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Location / Link</Label>
                    <Input
                      placeholder="Zoom, Google Meet, office, etc."
                      value={meetLocation}
                      onChange={(e) => setMeetLocation(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Compose footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
              <Button size="sm" variant="ghost" className="text-xs" onClick={goBack}>
                Cancel
              </Button>
              {drawerView === "email" && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={!emailSubject.trim() || !emailBody.trim() || createEmailMutation.isPending}
                  onClick={() => {
                    createEmailMutation.mutate(
                      {
                        contactId: contact.id,
                        subject: emailSubject.trim(),
                        body: emailBody.trim(),
                        direction: "outbound",
                        sentAt: new Date().toISOString(),
                        source: "manual",
                      },
                      {
                        onSuccess: () => {
                          setEmailSubject("");
                          setEmailBody("");
                          setDrawerView("default");
                        },
                      },
                    );
                  }}
                >
                  {createEmailMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : <><EnvelopeSimple size={13} /> Save</>}
                </Button>
              )}
              {drawerView === "note" && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={!noteContent.trim() || createNoteMutation.isPending}
                  onClick={handleAddNote}
                >
                  {createNoteMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : "Save Note"}
                </Button>
              )}
              {drawerView === "meeting" && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={!meetTitle.trim() || !meetDate || createMeetingMutation.isPending}
                  onClick={() => {
                    createMeetingMutation.mutate(
                      {
                        contactId: contact.id,
                        title: meetTitle.trim(),
                        startTime: new Date(meetDate).toISOString(),
                        location: meetLocation.trim() || undefined,
                        source: "manual",
                      },
                      {
                        onSuccess: () => {
                          setMeetTitle("");
                          setMeetDate("");
                          setMeetLocation("");
                          setDrawerView("default");
                        },
                      },
                    );
                  }}
                >
                  {createMeetingMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : <><CalendarBlank size={13} /> Schedule</>}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── Default View (Tabs) ── */
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-0 border-t border-border px-6">
              {(["context", "activity", "todo"] as const).map((tab) => {
                const labels: Record<string, string> = { context: "Context", activity: "Activity", todo: "To-do" };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "relative px-3 py-2.5 text-xs font-medium transition-colors",
                      activeTab === tab
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {labels[tab]}
                    {activeTab === tab && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Context Tab ── */}
              {activeTab === "context" && (
                <div className="px-6 py-4 space-y-4">
                  {/* Person context */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Person</p>
                    <div className="rounded-md bg-muted/40 px-3 py-2.5 space-y-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-medium">Ingested from:</span> {drawerSourceLabel(contact.source)}
                        </p>
                        {leadChannel && (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium">Channel:</span> {drawerChannelLabel(leadChannel)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Activity Tab ── */}
              {activeTab === "activity" && (
                <div className="px-6 pt-3 pb-6">
                  {/* Filter row */}
                  <div className="mb-3 flex items-center justify-end">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-muted",
                            activeFilters.size > 0 ? "text-foreground font-medium" : "text-muted-foreground",
                          )}
                        >
                          <FunnelSimple size={12} />
                          {activeFilters.size > 0
                            ? `Filtered (${activeFilters.size})`
                            : "All activity"}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-48 p-2">
                        <div className="space-y-0.5">
                          {TIMELINE_FILTERS.filter((f) => f !== "all").map((filter) => {
                            const isActive = activeFilters.has(filter);
                            return (
                              <button
                                key={filter}
                                type="button"
                                onClick={() => toggleFilter(filter)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs capitalize transition-colors",
                                  isActive ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                                )}
                              >
                                <div className={cn(
                                  "flex size-4 items-center justify-center rounded border",
                                  isActive ? "border-primary bg-primary text-primary-foreground" : "border-input",
                                )}>
                                  {isActive && <Check size={10} weight="bold" />}
                                </div>
                                {filter}
                              </button>
                            );
                          })}
                          {activeFilters.size > 0 && (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <button
                                type="button"
                                onClick={() => setActiveFilters(new Set())}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                              >
                                Clear filters
                              </button>
                            </>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Grouped timeline */}
                  {groupedTimeline.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>
                  ) : (
                    <div className="space-y-0">
                      {groupedTimeline.map((group) => (
                        <div key={group.label}>
                          <div className="mb-2 mt-4 first:mt-0">
                            <span className="text-xs font-semibold text-muted-foreground">{group.label}</span>
                          </div>
                          <div className="relative ml-4">
                            <div className="absolute top-0 bottom-0 left-[11px] w-px bg-border" />
                            {group.events.map((event) => {
                              const config = timelineEventConfig[event.type];
                              const Icon = config.icon;
                              const isExpanded = expandedEvents.has(event.id);
                              const hasExpandableContent = !!event.description;
                              const isEditable = EDITABLE_EVENT_TYPES.has(event.type);
                              const isBeingEdited = editingEventId === event.id;
                              const isTask = event.type === "task";

                              return (
                                <div
                                  key={event.id}
                                  className={cn(
                                    "relative flex w-full gap-3 pb-4 text-left last:pb-0",
                                    hasExpandableContent && !isBeingEdited && "cursor-pointer rounded-md transition-colors hover:bg-muted/40 -mx-1.5 px-1.5",
                                  )}
                                  onClick={() => {
                                    if (!isBeingEdited && hasExpandableContent) toggleEventExpanded(event.id);
                                  }}
                                >
                                  {isTask ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                      }}
                                      className={cn(
                                        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded",
                                        event.completed
                                          ? "bg-indigo-100 text-indigo-600"
                                          : "border border-border text-muted-foreground hover:border-indigo-400 hover:text-indigo-500",
                                      )}
                                    >
                                      {event.completed && <Check size={13} weight="bold" />}
                                    </button>
                                  ) : (
                                    <div className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full", config.color)}>
                                      <Icon size={13} />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1 pt-0.5">
                                    <div className="flex items-start justify-between gap-2 group/event">
                                      {isBeingEdited ? (
                                        <Input
                                          value={editingEventTitle}
                                          onChange={(e) => setEditingEventTitle(e.target.value)}
                                          className="h-6 text-sm font-medium"
                                          onClick={(e) => e.stopPropagation()}
                                          autoFocus
                                        />
                                      ) : (
                                        <p className={cn("text-sm text-foreground", isTask && event.completed && "line-through text-muted-foreground")}>
                                          {event.title}
                                        </p>
                                      )}
                                      <div className="flex shrink-0 items-center gap-1">
                                        {isEditable && !isBeingEdited && (
                                          <button
                                            type="button"
                                            className="rounded p-0.5 opacity-0 transition-opacity group-hover/event:opacity-70 hover:!opacity-100"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingEventId(event.id);
                                              setEditingEventTitle(event.title);
                                              setEditingEventDescription(event.description ?? "");
                                              setExpandedEvents((prev) => new Set(prev).add(event.id));
                                            }}
                                          >
                                            <PencilSimple size={12} />
                                          </button>
                                        )}
                                        <span className="text-[11px] text-muted-foreground">{formatTime(event.date)}</span>
                                      </div>
                                    </div>
                                    {isTask && (event.assignee || event.dueDate) && !isBeingEdited && (
                                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {event.assignee && <span>{event.assignee}</span>}
                                        {event.assignee && event.dueDate && <span> &middot; </span>}
                                        {event.dueDate && (
                                          <span>Due {new Date(event.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                        )}
                                      </p>
                                    )}
                                    {isBeingEdited ? (
                                      <div className="mt-1.5 space-y-2" onClick={(e) => e.stopPropagation()}>
                                        <Textarea
                                          value={editingEventDescription}
                                          onChange={(e) => setEditingEventDescription(e.target.value)}
                                          className="min-h-[50px] max-h-[160px] text-xs"
                                          placeholder="Add details..."
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingEventId(null)}>Cancel</Button>
                                          <Button size="sm" className="h-6 text-xs" onClick={() => { setEditingEventId(null); }}>Save</Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {event.description && (
                                          isExpanded && event.descriptionHtml ? (
                                            <div
                                              className="email-html-body mt-1 max-w-none"
                                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(event.descriptionHtml, { FORBID_TAGS: ["style", "script", "iframe", "form", "input"], FORBID_ATTR: ["onerror", "onload", "onclick"] }) }}
                                            />
                                          ) : (
                                            <p className={cn("mt-0.5 text-xs text-muted-foreground", isExpanded ? "whitespace-pre-wrap" : "line-clamp-2")}>
                                              {isExpanded ? normalizeBody(event.description) : event.description}
                                            </p>
                                          )
                                        )}
                                      </>
                                    )}
                                    {!isBeingEdited && (
                                      <>
                                        {event.type === "opportunity_stage_change" && event.fromStage && event.toStage && (
                                          <p className="mt-0.5 text-xs text-muted-foreground">
                                            {event.fromStage} &rarr; {event.toStage}
                                            {event.changedBy && <span> &middot; by {event.changedBy}</span>}
                                          </p>
                                        )}
                                        {event.type === "contact_created" && event.source && (
                                          <p className="mt-0.5 text-xs text-muted-foreground">Source: {event.source}</p>
                                        )}
                                        {(event.type === "meeting" || event.type === "calendar_event") && (
                                          <p className="mt-0.5 text-xs text-muted-foreground">
                                            {[event.duration, event.location].filter(Boolean).join(" \u00B7 ")}
                                          </p>
                                        )}
                                        {event.direction && (
                                          <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 font-normal">
                                            {event.direction === "outbound" ? "Outbound" : "Inbound"}
                                          </Badge>
                                        )}
                                        {event.author && event.type !== "opportunity_stage_change" && !isTask && (
                                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                                            by {event.author}
                                            {event.platform && <span> via {event.platform}</span>}
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── To-do Tab ── */}
              {activeTab === "todo" && (
                <div className="px-6 py-4 space-y-4">
                  {/* Add task form */}
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <Input
                      placeholder="New task..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                        <SelectTrigger className="h-7 w-[140px] text-xs">
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="h-7 w-[130px] text-xs"
                      />
                      <Button
                        size="sm"
                        className="ml-auto h-7 text-xs"
                        disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                        onClick={() => {
                          createTaskMutation.mutate(
                            {
                              title: newTaskTitle.trim(),
                              contactId: contact.id,
                              assigneeId: newTaskAssignee || undefined,
                              dueDate: newTaskDueDate || undefined,
                            },
                            {
                              onSuccess: () => {
                                setNewTaskTitle("");
                                setNewTaskAssignee("");
                                setNewTaskDueDate("");
                              },
                            },
                          );
                        }}
                      >
                        {createTaskMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : "Add"}
                      </Button>
                    </div>
                  </div>

                  {/* Task list */}
                  <div className="space-y-1">
                    {contactTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No tasks yet</p>
                    ) : (
                      contactTasks.map((task) => (
                        <div
                          key={task.id}
                          className="group flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
                        >
                          <button
                            type="button"
                            className={cn(
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                              task.completed
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input hover:border-primary",
                            )}
                            onClick={() => {
                              updateTaskMutation.mutate({ id: task.id, completed: !task.completed });
                            }}
                          >
                            {task.completed && <Check size={10} weight="bold" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-sm", task.completed && "line-through text-muted-foreground")}>{task.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {task.assigneeName}
                              {task.dueDate && (
                                <span> &middot; Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── Review Banner (unreviewed contacts) ── */}
        {contact.visibility === "unreviewed" && !isEditing && drawerView === "default" && (
          <div className="border-t border-border bg-muted/30 px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                This contact is <span className="font-medium text-foreground">unreviewed</span> and only visible to you.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    updateMutation.mutate({
                      id: contact.id,
                      data: { visibility: "private" as ContactVisibility },
                    });
                  }}
                >
                  Keep private
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    updateMutation.mutate({
                      id: contact.id,
                      data: { visibility: "shared" as ContactVisibility },
                    });
                  }}
                >
                  Share with team
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vendor Domain Confirmation */}
      <Dialog open={showVendorConfirm} onOpenChange={setShowVendorConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mute Domain</DialogTitle>
            <DialogDescription>
              Mute <strong>{emailDomain}</strong>? All contacts from this domain will be removed and
              future emails will be filtered out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVendorConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={addMutedDomainMutation.isPending} onClick={handleMarkAsVendor}>
              {addMutedDomainMutation.isPending ? (
                <>
                  <SpinnerGap size={14} className="animate-spin" />
                  Muting...
                </>
              ) : (
                "Mute Domain"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{contact.name}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={handleDelete}>
              {deleteMutation.isPending ? (
                <>
                  <SpinnerGap size={14} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

