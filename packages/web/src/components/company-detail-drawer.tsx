import type { Company, Contact } from "@crm/shared";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  CalendarBlank,
  Check,
  DotsThree,
  EnvelopeSimple,
  FunnelSimple,
  GlobeSimple,
  LinkedinLogo,
  MagnifyingGlass,
  NoteBlank,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";

import { FunnelStageBadge } from "@/components/funnel-stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetClose } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useContacts } from "@/hooks/use-contacts";
import { useUpdateCompany, useDeleteCompany } from "@/hooks/use-companies";
import { useCreateNote } from "@/hooks/use-notes";
import { useTimeline } from "@/hooks/use-timeline";
import { useTasks, useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { useCreateMeeting } from "@/hooks/use-meetings";
import { useCreateEmail } from "@/hooks/use-meetings";
import { useUsers } from "@/hooks/use-users";
import { mapTimelineEntry } from "@/lib/timeline-mapper";
import { timelineEventConfig } from "@/lib/drawer-event-config";
import { formatTime, groupByDate, drawerSourceLabel } from "@/lib/drawer-helpers";
import {
  type DrawerTab,
  type DrawerTimelineEvent,
  type TimelineFilter,
  EDITABLE_EVENT_TYPES,
  TIMELINE_FILTERS,
  filterToTypes,
} from "@/lib/drawer-types";
import { cn } from "@/lib/utils";

// ── Props ──

interface CompanyDetailDrawerProps {
  company: Company;
  onClose: () => void;
  onOpenContact?: (contact: Contact) => void;
}

// ── Component ──

export function CompanyDetailDrawer({ company, onClose, onOpenContact }: CompanyDetailDrawerProps) {
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(company.name);
  const [editDomain, setEditDomain] = useState(company.domain ?? "");
  const [editWebsite, setEditWebsite] = useState(company.websiteUrl ?? "");
  const [editLinkedin, setEditLinkedin] = useState(company.linkedinUrl ?? "");

  // Tabs & view stack
  const [activeTab, setActiveTab] = useState<DrawerTab>("context");
  type DrawerView = "default" | "email" | "note" | "meeting";
  const [drawerView, setDrawerView] = useState<DrawerView>("default");
  const [noteContent, setNoteContent] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailForContact, setEmailForContact] = useState("");
  const [meetTitle, setMeetTitle] = useState("");
  const [meetDate, setMeetDate] = useState("");
  const [meetLocation, setMeetLocation] = useState("");

  // To-do form
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskForContact, setNewTaskForContact] = useState("");

  // Timeline
  const [activeFilters, setActiveFilters] = useState<Set<TimelineFilter>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState("");
  const [editingEventDescription, setEditingEventDescription] = useState("");

  // Dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Data
  const { data: contactsData } = useContacts({ companyId: company.id });
  const contacts = contactsData?.contacts ?? [];
  const updateMutation = useUpdateCompany();
  const deleteMutation = useDeleteCompany();
  const createNoteMutation = useCreateNote();
  const createMeetingMutation = useCreateMeeting();
  const createEmailMutation = useCreateEmail();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();

  // Real timeline
  const { data: timelineData } = useTimeline({ companyId: company.id });
  const realTimeline = useMemo(
    () => (timelineData?.timeline ?? []).map((e) => mapTimelineEntry(e)),
    [timelineData],
  );

  // Real tasks
  const { data: tasksData } = useTasks({ companyId: company.id });
  const tasks = tasksData?.tasks ?? [];

  // Users (for assignee picker)
  const { data: usersData } = useUsers();
  const allUsers = usersData?.users ?? [];

  // Reset state on company change
  const prevCompanyId = useRef(company.id);
  if (company.id !== prevCompanyId.current) {
    prevCompanyId.current = company.id;
    setIsEditing(false);
    setEditName(company.name);
    setEditDomain(company.domain ?? "");
    setEditWebsite(company.websiteUrl ?? "");
    setEditLinkedin(company.linkedinUrl ?? "");
    setDrawerView("default");
    setActiveTab("context");
    setNoteContent("");
    setNoteDate("");
    setActiveFilters(new Set());
    setExpandedEvents(new Set());
    setEditingEventId(null);
    setShowDeleteConfirm(false);
  }

  // Filter timeline
  const filteredTimeline = useMemo(() => {
    if (activeFilters.size === 0) return realTimeline;
    const allowedTypes = new Set<string>();
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
      if (filter === "all") return new Set();
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  function toggleEventExpanded(eventId: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  // Handlers
  function handleSaveEdit() {
    updateMutation.mutate(
      {
        id: company.id,
        data: {
          name: editName.trim(),
          domain: editDomain.trim() || undefined,
          websiteUrl: editWebsite.trim() || undefined,
          linkedinUrl: editLinkedin.trim() || undefined,
        },
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleCancelEdit() {
    setEditName(company.name);
    setEditDomain(company.domain ?? "");
    setEditWebsite(company.websiteUrl ?? "");
    setEditLinkedin(company.linkedinUrl ?? "");
    setIsEditing(false);
  }

  function handleDelete() {
    deleteMutation.mutate(company.id, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        onClose();
      },
    });
  }

  function handleAddNote() {
    if (!noteContent.trim()) return;
    // Notes need a contactId — pick first contact as fallback
    const contactId = contacts[0]?.id;
    if (!contactId) return;
    createNoteMutation.mutate(
      { contactId, content: noteContent.trim() },
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

  // ── Compose views ──

  if (drawerView !== "default") {
    return (
      <div className="flex h-full flex-col">
        {/* Compose header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button type="button" onClick={goBack} className="rounded-sm p-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </button>
          <h3 className="text-sm font-semibold">
            {drawerView === "email" ? "Compose Email" : drawerView === "note" ? "Add Note" : "Schedule Meeting"}
          </h3>
        </div>

        {/* Compose body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Contact picker */}
          {contacts.length > 0 && drawerView === "email" && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">To</label>
              <Select value={emailForContact} onValueChange={setEmailForContact}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue placeholder="Select contact..." />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.email ? ` (${c.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {drawerView === "email" && (
            <>
              <Input placeholder="Subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="h-8 text-sm" />
              <Textarea placeholder="Write your email..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="min-h-[120px] flex-1 resize-none text-sm" />
            </>
          )}

          {drawerView === "note" && (
            <>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Date & Time</label>
                <Input type="datetime-local" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <Textarea placeholder="Write your note..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className="min-h-[120px] flex-1 resize-none text-sm" />
            </>
          )}

          {drawerView === "meeting" && (
            <>
              <Input placeholder="Meeting title" value={meetTitle} onChange={(e) => setMeetTitle(e.target.value)} className="h-8 text-sm" />
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Date & Time</label>
                <Input type="datetime-local" value={meetDate} onChange={(e) => setMeetDate(e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <Input placeholder="Location or meeting link" value={meetLocation} onChange={(e) => setMeetLocation(e.target.value)} className="h-8 text-sm" />
            </>
          )}
        </div>

        {/* Compose footer */}
        <div className="border-t border-border px-6 py-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={goBack}>Cancel</Button>
          {drawerView === "email" && (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!emailSubject.trim() || !emailBody.trim() || !emailForContact || createEmailMutation.isPending}
              onClick={() => {
                createEmailMutation.mutate(
                  {
                    contactId: emailForContact,
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
                      setEmailForContact("");
                      setDrawerView("default");
                    },
                  },
                );
              }}
            >
              {createEmailMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : null}
              Save
            </Button>
          )}
          {drawerView === "note" && (
            <Button size="sm" className="h-7 text-xs" onClick={handleAddNote} disabled={!noteContent.trim() || createNoteMutation.isPending}>
              {createNoteMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : null}
              Save Note
            </Button>
          )}
          {drawerView === "meeting" && (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!meetTitle.trim() || !meetDate || createMeetingMutation.isPending}
              onClick={() => {
                const contactId = contacts[0]?.id;
                if (!contactId) return;
                createMeetingMutation.mutate(
                  {
                    contactId,
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
              {createMeetingMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : null}
              Schedule
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Default view ──

  return (
    <>
      <div className="flex h-full flex-col">
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 pr-4">
              {/* Company name */}
              {isEditing ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full truncate border-0 border-b border-dashed border-border bg-transparent text-lg font-bold outline-none focus:border-primary"
                  placeholder="Company name"
                  autoFocus
                />
              ) : (
                <h2 className="truncate text-lg font-bold">{company.name}</h2>
              )}

              {/* Domain */}
              {isEditing ? (
                <input
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  className="mt-1 w-full truncate border-0 border-b border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none focus:border-primary"
                  placeholder="Domain (e.g. acme.com)"
                />
              ) : (
                company.domain && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{company.domain}</p>
                )
              )}

              {/* Contact fields */}
              <div className="mt-1.5 flex flex-col gap-0.5">
                {/* Website */}
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <GlobeSimple size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      className="min-w-0 flex-1 border-0 border-b border-dashed border-border bg-transparent text-sm text-muted-foreground outline-none focus:border-primary focus:text-foreground"
                      placeholder="Website URL"
                    />
                  </div>
                ) : (
                  company.websiteUrl && (
                    <a href={company.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-w-full">
                      <GlobeSimple size={13} className="shrink-0" />
                      <span className="truncate">{company.websiteUrl.replace(/^https?:\/\//, "")}</span>
                    </a>
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
                  company.linkedinUrl && (
                    <a href={company.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-w-full">
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
                  <button type="button" onClick={handleSaveEdit} disabled={!editName.trim() || updateMutation.isPending} className="rounded-sm p-1 text-green-600 transition-opacity hover:opacity-80 disabled:opacity-40" title="Save">
                    {updateMutation.isPending ? <SpinnerGap size={15} className="animate-spin" /> : <Check size={15} weight="bold" />}
                  </button>
                  <button type="button" onClick={handleCancelEdit} className="rounded-sm p-1 text-muted-foreground transition-opacity hover:text-foreground" title="Cancel">
                    <X size={15} weight="bold" />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setIsEditing(true)} className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100">
                    <PencilSimple size={15} />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80" title="Add activity">
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
                      <button type="button" className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100">
                        <DotsThree size={18} weight="bold" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setIsEditing(true)}>
                        <PencilSimple size={14} className="mr-2" />
                        Edit company info
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <MagnifyingGlass size={14} className="mr-2" />
                        Research on LinkedIn
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash size={14} className="mr-2" />
                        Delete company
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
        </div>

        {/* ── Tab bar ── */}
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
                  activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {labels[tab]}
                {activeTab === tab && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground rounded-full" />}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Context Tab ── */}
          {activeTab === "context" && (
            <div className="px-6 py-4 space-y-4">
              {/* Company Summary */}
              <div className="rounded-lg bg-muted/30 px-3 py-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Company Info</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {company.industry && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Industry</p>
                      <p className="text-xs">{company.industry}</p>
                    </div>
                  )}
                  {company.size && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Size</p>
                      <p className="text-xs">{company.size}</p>
                    </div>
                  )}
                  {company.location && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Location</p>
                      <p className="text-xs">{company.location}</p>
                    </div>
                  )}
                  {company.fundingStage && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Funding</p>
                      <p className="text-xs">{company.fundingStage}</p>
                    </div>
                  )}
                  {company.techStack && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground">Tech Stack</p>
                      <p className="text-xs">{company.techStack}</p>
                    </div>
                  )}
                  {company.description && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground">Description</p>
                      <p className="text-xs text-muted-foreground">{company.description}</p>
                    </div>
                  )}
                </div>
                {company.source && (
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium">Ingested from:</span> {drawerSourceLabel(company.source)}
                    </p>
                  </div>
                )}
              </div>

              {/* People at this company */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  People ({contacts.length})
                </p>
                {contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No contacts linked to this company yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    {contacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => onOpenContact?.(contact)}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{contact.name}</p>
                          {contact.title && <p className="text-xs text-muted-foreground truncate">{contact.title}</p>}
                        </div>
                        <FunnelStageBadge pipeline={contact.pipeline ?? company.pipeline} />
                      </button>
                    ))}
                  </div>
                )}
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
                      {activeFilters.size > 0 ? `Filtered (${activeFilters.size})` : "All activity"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-48 p-2">
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
                          <button type="button" onClick={() => setActiveFilters(new Set())} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">
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
                      <div className="space-y-1">
                        {group.events.map((event) => {
                          const config = timelineEventConfig[event.type];
                          const Icon = config.icon;
                          const isExpanded = expandedEvents.has(event.id);
                          const isEditable = EDITABLE_EVENT_TYPES.has(event.type);
                          const isBeingEdited = editingEventId === event.id;

                          return (
                            <div
                              key={event.id}
                              className="group relative flex gap-3 rounded-md px-2 py-2 hover:bg-muted/30 transition-colors"
                            >
                              <div className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", config.color)}>
                                <Icon size={12} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium truncate">
                                    {event.contactName && (
                                      <span className="text-muted-foreground font-normal">{event.contactName} · </span>
                                    )}
                                    {event.title}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(event.date)}</span>
                                  {event.direction && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                      {event.direction}
                                    </Badge>
                                  )}
                                  {isEditable && !isBeingEdited && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEventId(event.id);
                                        setEditingEventTitle(event.title);
                                        setEditingEventDescription(event.description ?? "");
                                      }}
                                      className="ml-auto shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100 p-0.5"
                                    >
                                      <PencilSimple size={11} />
                                    </button>
                                  )}
                                </div>

                                {/* Event metadata */}
                                {event.type === "opportunity_stage_change" && event.fromStage && event.toStage && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {event.fromStage} → {event.toStage}{event.changedBy ? ` by ${event.changedBy}` : ""}
                                  </p>
                                )}
                                {event.type === "contact_created" && event.source && (
                                  <p className="text-[11px] text-muted-foreground">via {event.source}</p>
                                )}
                                {(event.duration || event.location) && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {[event.duration, event.location].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                                {event.author && <p className="text-[11px] text-muted-foreground">by {event.author}</p>}
                                {event.platform && <p className="text-[11px] text-muted-foreground">on {event.platform}</p>}
                                {event.cost && <p className="text-[11px] text-muted-foreground">Cost: {event.cost}</p>}

                                {/* Description */}
                                {event.description && !isBeingEdited && (
                                  <button type="button" onClick={() => toggleEventExpanded(event.id)} className="mt-0.5 text-left w-full">
                                    {isExpanded && event.descriptionHtml ? (
                                      <div
                                        className="email-html-body mt-1 max-w-none"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(event.descriptionHtml, { FORBID_TAGS: ["style", "script", "iframe", "form", "input"], FORBID_ATTR: ["onerror", "onload", "onclick"] }) }}
                                      />
                                    ) : (
                                      <p className={cn("text-xs text-muted-foreground", !isExpanded && "line-clamp-2", isExpanded && "whitespace-pre-wrap")}>
                                        {event.description}
                                      </p>
                                    )}
                                  </button>
                                )}

                                {/* Inline edit form */}
                                {isBeingEdited && (
                                  <div className="mt-1 space-y-1">
                                    <input
                                      value={editingEventTitle}
                                      onChange={(e) => setEditingEventTitle(e.target.value)}
                                      className="w-full border-0 border-b border-dashed border-border bg-transparent text-xs outline-none focus:border-primary"
                                    />
                                    <textarea
                                      value={editingEventDescription}
                                      onChange={(e) => setEditingEventDescription(e.target.value)}
                                      className="w-full border-0 border-b border-dashed border-border bg-transparent text-xs outline-none focus:border-primary resize-none"
                                      rows={2}
                                    />
                                    <div className="flex gap-1">
                                      <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => setEditingEventId(null)}>Save</Button>
                                      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => setEditingEventId(null)}>Cancel</Button>
                                    </div>
                                  </div>
                                )}

                                {/* Task-specific */}
                                {event.type === "task" && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <input type="checkbox" checked={event.completed} readOnly className="size-3 rounded accent-primary" />
                                    {event.assignee && <span className="text-[11px] text-muted-foreground">{event.assignee}</span>}
                                    {event.dueDate && <span className="text-[11px] text-muted-foreground">due {event.dueDate}</span>}
                                  </div>
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New task..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="h-8 flex-1 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                    onClick={() => {
                      createTaskMutation.mutate(
                        {
                          title: newTaskTitle.trim(),
                          companyId: company.id,
                          contactId: newTaskForContact || undefined,
                          assigneeId: newTaskAssignee || undefined,
                          dueDate: newTaskDueDate || undefined,
                        },
                        {
                          onSuccess: () => {
                            setNewTaskTitle("");
                            setNewTaskAssignee("");
                            setNewTaskDueDate("");
                            setNewTaskForContact("");
                          },
                        },
                      );
                    }}
                  >
                    {createTaskMutation.isPending ? <SpinnerGap size={12} className="animate-spin" /> : "Add"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                    <SelectTrigger className="h-7 flex-1 text-[11px]">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newTaskForContact} onValueChange={setNewTaskForContact}>
                    <SelectTrigger className="h-7 flex-1 text-[11px]">
                      <SelectValue placeholder="For contact..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="h-7 w-32 text-[11px]"
                  />
                </div>
              </div>

              {/* Task list */}
              <div className="space-y-1">
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No tasks yet</p>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        className="mt-0.5 size-3.5 rounded accent-primary cursor-pointer"
                        onChange={() => {
                          updateTaskMutation.mutate({ id: task.id, completed: !task.completed });
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs", task.completed && "line-through text-muted-foreground")}>{task.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {[task.assigneeName, task.dueDate ? `due ${new Date(task.dueDate).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}
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

      {/* Delete confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{company.name}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <SpinnerGap size={14} className="animate-spin mr-1" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
