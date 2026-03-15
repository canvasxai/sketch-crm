/**
 * Directory page — unified Contacts + Companies view with tabbed layout.
 *
 * Layout:
 * 1. Header — "Directory" title + stats + ClassificationPopover + "+Ingest" button
 * 2. Tabs — [ Contacts | Companies ]
 * 3. Tab-specific toolbar, table, pagination, and detail drawer
 */
import {
  COMPANY_CATEGORIES,
  type CompanyCategory,
  CONTACT_CATEGORIES,
  CONTACT_VISIBILITIES,
  type Contact,
  type ContactCategory,
  type ContactVisibility,
  type Company,
  type DedupCandidate,
  type DedupCandidateContact,
} from "@crm/shared";
import {
  ArrowsMerge,
  BuildingsIcon,
  CheckCircle,
  CopySimple,
  Crown,
  EnvelopeSimple,
  Eye,
  LinkedinLogo,
  ListChecks,
  MagnifyingGlass,
  Plus,
  SpinnerGap,
  Trash,
  Users,
  Warning,
  X,
} from "@phosphor-icons/react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ClassificationPopover } from "@/components/classification-popover";
import { CompanyDetailDrawer } from "@/components/company-detail-drawer";
import { ContactDetailDrawer } from "@/components/contact-detail-drawer";
import { EmptyState } from "@/components/empty-state";
import { IngestModal } from "@/components/ingest-modal";
import { MultiFilterPopover } from "@/components/multi-filter-popover";
import { PipelineBadge } from "@/components/funnel-stage-badge";
import { PipelineSelector } from "@/components/pipeline-selector";
import { ResizableDrawerWrapper } from "@/components/resizable-drawer-wrapper";
import { WorkflowStatusIcon } from "@/components/workflow-status-icon";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useCompanies, useCreateCompany, useUpdateCompany } from "@/hooks/use-companies";
import {
  useBatchDeleteContacts,
  useBatchUpdateContacts,
  useContactCounts,
  useContacts,
  useUpdateContact,
} from "@/hooks/use-contacts";
import { useNeedsReviewCount, useNeedsReviewList, useConfirmClassification } from "@/hooks/use-classify";
import {
  useDedupCandidateCount,
  useDedupContactIds,
  usePendingDedupCandidates,
  useMergeContacts,
  useDismissCandidate,
} from "@/hooks/use-dedup-candidates";
import { useCompaniesNextUp, useCompaniesLastTouched, useContactsNextUp, useContactsLastTouched } from "@/hooks/use-insights";
import { useUsers } from "@/hooks/use-users";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

// ── Route ──

export const directoryRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/directory",
  component: DirectoryPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "contacts",
    // Contacts filters
    search: (search.search as string) || "",
    category: (search.category as string) || "",
    visibility: (search.visibility as string) || "",
    ownerId: (search.ownerId as string) || "",
    page: Number(search.page) || 1,
    // Companies deep-link
    open: (search.open as string) || "",
  }),
});

// ── URL param helpers ──

function parseMulti(raw: string): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").filter(Boolean));
}

function serializeMulti(set: Set<string>): string {
  return [...set].join(",");
}

// ── Main page ──

function DirectoryPage() {
  const navigate = useNavigate({ from: directoryRoute.fullPath });
  const { tab } = directoryRoute.useSearch();
  const [showIngestModal, setShowIngestModal] = useState(false);
  const { data: dedupCount } = useDedupCandidateCount();
  const pendingDedups = dedupCount?.count ?? 0;
  const { data: reviewCount } = useNeedsReviewCount();
  const totalReviewCount = pendingDedups + (reviewCount ?? 0);

  function setTab(next: string) {
    navigate({
      search: (prev) => ({ ...prev, tab: next, page: 1 }),
      replace: true,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Directory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your contacts and companies in one place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setShowIngestModal(true)}>
            <Plus size={16} />
            Ingest
          </Button>
          <ClassificationPopover />
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList variant="line">
          <TabsTrigger value="contacts">
            <Users size={14} className="mr-1.5" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="companies">
            <BuildingsIcon size={14} className="mr-1.5" />
            Companies
          </TabsTrigger>
          <TabsTrigger value="review" className="relative">
            <ListChecks size={14} className="mr-1.5" />
            Review
            {totalReviewCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-medium text-white">
                {totalReviewCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-0">
          <ContactsTab />
        </TabsContent>
        <TabsContent value="companies" className="mt-0">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="review" className="mt-0">
          <ReviewTab />
        </TabsContent>
      </Tabs>

      {/* ── Ingest Modal ── */}
      <IngestModal open={showIngestModal} onOpenChange={setShowIngestModal} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Contacts Tab
// ══════════════════════════════════════════════════════════

function ContactsTab() {
  const navigate = useNavigate({ from: directoryRoute.fullPath });
  const { search: searchParam, category, visibility, ownerId, page } = directoryRoute.useSearch();

  // ── Multi-select filter state (hydrated from URL params) ──
  const stageFilters = useMemo(() => parseMulti(category), [category]);
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

  // ── User lookup ──
  const { data: usersData } = useUsers();
  const users = usersData?.users ?? [];

  // ── Contact counts ──
  const { data: countsData } = useContactCounts();
  const totalCount = countsData?.total ?? 0;
  const sharedCount = countsData?.visibilityCounts?.shared ?? 0;

  // ── Contact query ──
  const { data, isLoading } = useContacts({
    search: debouncedSearch || undefined,
    limit: 500,
  });

  const allContacts = data?.contacts ?? [];

  // ── Client-side filtering ──
  const filteredContacts = useMemo(() => {
    return allContacts.filter((c) => {
      if (stageFilters.size > 0 && !stageFilters.has(c.category ?? "")) return false;
      if (visibilityFilters.size > 0 && !visibilityFilters.has(c.visibility)) return false;
      if (ownerFilters.size > 0) {
        const ownerIds = (c.owners ?? []).map((o) => o.id);
        if (ownerIds.length === 0 || !ownerIds.some((id) => ownerFilters.has(id))) return false;
      }
      return true;
    });
  }, [allContacts, stageFilters, visibilityFilters, ownerFilters]);

  // ── Pagination ──
  const limit = 20;
  const offset = (page - 1) * limit;
  const total = filteredContacts.length;
  const contacts = filteredContacts.slice(offset, offset + limit);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const hasPrev = page > 1;
  const hasNext = offset + limit < total;

  // ── Batch insights ──
  const contactIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const { data: nextUpData } = useContactsNextUp(contactIds);
  const { data: lastTouchedData } = useContactsLastTouched(contactIds);

  // ── Dedup awareness ──
  const { data: dedupContactIds } = useDedupContactIds();
  const dedupIds = dedupContactIds ?? new Set<string>();

  // ── Selection mode ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { setSelected(new Set()); }, [data]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  }

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0;

  // ── Batch operations ──
  const batchUpdateMutation = useBatchUpdateContacts();
  const batchDeleteMutation = useBatchDeleteContacts();
  const updateContactMutation = useUpdateContact();

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

  function handleContactCategoryChange(contact: Contact, newCategory: string | null) {
    updateContactMutation.mutate({
      id: contact.id,
      data: { category: (newCategory ?? undefined) as ContactCategory | undefined },
    });
  }

  // ── Filter nav helpers ──
  function setStageFilters(next: Set<string>) {
    navigate({ search: (prev) => ({ ...prev, category: serializeMulti(next), page: 1 }), replace: true });
  }
  function setVisibilityFiltersNav(next: Set<string>) {
    navigate({ search: (prev) => ({ ...prev, visibility: serializeMulti(next), page: 1 }), replace: true });
  }
  function setOwnerFiltersNav(next: Set<string>) {
    navigate({ search: (prev) => ({ ...prev, ownerId: serializeMulti(next), page: 1 }), replace: true });
  }

  return (
    <>
      {/* Stats bar */}
      {totalCount > 0 && (
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{totalCount} total</span>
          {sharedCount > 0 && (
            <>
              <span className="text-border">|</span>
              <span>{sharedCount} shared</span>
            </>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mt-3 flex items-center gap-2">
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
          label="All categories"
          options={COMPANY_CATEGORIES.map((s: CompanyCategory) => ({
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
          onClick={() => { setSelectionMode((prev) => !prev); setSelected(new Set()); }}
        >
          <ListChecks size={14} />
          Select
        </Button>

        {selectionMode && someSelected && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handlePromoteToShared} disabled={batchUpdateMutation.isPending}>
              <Eye size={14} />
              Promote {selected.size} to shared
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10" onClick={handleBatchDelete} disabled={batchDeleteMutation.isPending}>
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
            description="Import contacts from LinkedIn, Gmail, CSV, or add one manually."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="w-5">
                {selectionMode && (
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="size-3.5 rounded border-border accent-primary cursor-pointer" />
                )}
              </div>
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-32">Domain</div>
              <div className="w-24">Category</div>
              <div className="w-20">Owner</div>
              <div className="w-44">Next up</div>
              <div className="w-28">Last touched</div>
            </div>

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
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(contact.id)} className="size-3.5 rounded border-border accent-primary cursor-pointer" />
                    ) : (
                      <WorkflowStatusIcon contact={contact} dedupContactIds={dedupIds} onClick={() => {
                        navigate({ search: (prev) => ({ ...prev, tab: "review" }), replace: true });
                      }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => setDetailContact(contact)}>
                    <div className="text-sm font-medium truncate flex items-center gap-1">
                      {contact.name}
                      {contact.isDecisionMaker && <span title="Decision Maker"><Crown size={12} weight="fill" className="text-amber-500 shrink-0" /></span>}
                    </div>
                    {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
                  </div>
                  <div className="w-32 text-xs text-muted-foreground truncate" onClick={() => setDetailContact(contact)}>
                    {domain ?? "\u2014"}
                  </div>
                  <div className="w-24" onClick={(e) => e.stopPropagation()}>
                    <PipelineSelector
                      value={contact.category}
                      options={CONTACT_CATEGORIES}
                      onChange={(p) => handleContactCategoryChange(contact, p)}
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
            <span className="text-sm text-muted-foreground">Showing {from}&ndash;{to} of {total}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 }), replace: true })}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => navigate({ search: (prev) => ({ ...prev, page: page + 1 }), replace: true })}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Detail Sheet ── */}
      <Sheet open={!!detailContact} onOpenChange={(open) => { if (!open) setDetailContact(null); }}>
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

    </>
  );
}

// ══════════════════════════════════════════════════════════
// Companies Tab
// ══════════════════════════════════════════════════════════

function CompaniesTab() {
  // ── Search state ──
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Filter state ──
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set());
  const [productFilters, setProductFilters] = useState<Set<string>>(new Set());
  const [ownerFilters, setOwnerFilters] = useState<Set<string>>(new Set());

  // ── Queries ──
  const { data, isLoading } = useCompanies({ search: debouncedSearch || undefined, limit: 500 });
  const allCompanies = data?.companies ?? [];

  const { data: contactsData } = useContacts({ limit: 1000 });
  const { data: usersData } = useUsers();
  const users = usersData?.users ?? [];
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as [string, string])),
    [users],
  );

  // ── Per-company contact meta ──
  type CompanyMeta = { names: string[]; ownerIds: string[]; hasCanvas: boolean; hasSketch: boolean; hasServices: boolean };

  const companyContactsMap = useMemo(() => {
    const map = new Map<string, CompanyMeta>();
    for (const c of contactsData?.contacts ?? []) {
      if (c.companyId) {
        const existing = map.get(c.companyId) ?? { names: [], ownerIds: [], hasCanvas: false, hasSketch: false, hasServices: false };
        existing.names.push(c.name);
        if (c.createdByUserId && !existing.ownerIds.includes(c.createdByUserId)) existing.ownerIds.push(c.createdByUserId);
        if (c.isCanvasUser) existing.hasCanvas = true;
        if (c.isSketchUser) existing.hasSketch = true;
        if (c.usesServices) existing.hasServices = true;
        map.set(c.companyId, existing);
      }
    }
    return map;
  }, [contactsData]);

  // ── Filtering ──
  const filteredCompanies = useMemo(() => {
    return allCompanies.filter((company) => {
      const meta = companyContactsMap.get(company.id);
      if (stageFilters.size > 0 && !stageFilters.has(company.category)) return false;
      if (productFilters.size > 0) {
        if (!meta) return false;
        let hasMatch = false;
        if (productFilters.has("canvas") && meta.hasCanvas) hasMatch = true;
        if (productFilters.has("sketch") && meta.hasSketch) hasMatch = true;
        if (productFilters.has("services") && meta.hasServices) hasMatch = true;
        if (!hasMatch) return false;
      }
      if (ownerFilters.size > 0) {
        if (!meta) return false;
        if (!meta.ownerIds.some((id) => ownerFilters.has(id))) return false;
      }
      return true;
    });
  }, [allCompanies, companyContactsMap, stageFilters, productFilters, ownerFilters]);

  // ── Pagination ──
  const limit = 20;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [stageFilters, productFilters, ownerFilters, debouncedSearch]);

  const total = filteredCompanies.length;
  const offset = (page - 1) * limit;
  const companies = filteredCompanies.slice(offset, offset + limit);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const hasPrev = page > 1;
  const hasNext = offset + limit < total;

  // ── Insights ──
  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);
  const { data: nextUpData } = useCompaniesNextUp(companyIds);
  const { data: lastTouchedData } = useCompaniesLastTouched(companyIds);

  // ── Drawer stack ──
  type DrawerStack = { type: "company"; company: Company } | { type: "contact"; contact: Contact; fromCompany: Company };
  const [drawerStack, setDrawerStack] = useState<DrawerStack | null>(null);

  function openCompanyDrawer(company: Company) { setDrawerStack({ type: "company", company }); }
  function openContactFromCompany(contact: Contact) {
    if (drawerStack?.type === "company") setDrawerStack({ type: "contact", contact, fromCompany: drawerStack.company });
  }
  function backToCompany() {
    if (drawerStack?.type === "contact") setDrawerStack({ type: "company", company: drawerStack.fromCompany });
  }
  function closeDrawer() { setDrawerStack(null); }

  // ── Mutations ──
  const updateCompanyMutation = useUpdateCompany();
  const createMutation = useCreateCompany();

  // ── Add dialog ──
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [location, setLocation] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [source, setSource] = useState("");

  const canSubmit = name.trim().length > 0;

  function resetAndClose() {
    setName(""); setDomain(""); setIndustry(""); setSize("");
    setLocation(""); setWebsiteUrl(""); setLinkedinUrl(""); setSource("");
    setShowAddDialog(false);
  }

  function handleCreate() {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        name: name.trim(),
        ...(domain && { domain }),
        ...(industry && { industry }),
        ...(size && { size }),
        ...(location && { location }),
        ...(websiteUrl && { websiteUrl }),
        ...(linkedinUrl && { linkedinUrl }),
        ...(source && { source: source as "linkedin" | "apollo" | "csv" | "manual" | "email_domain" }),
      },
      { onSuccess: resetAndClose },
    );
  }

  function getCompanyOwner(companyId: string): string | null {
    const meta = companyContactsMap.get(companyId);
    if (!meta || meta.ownerIds.length === 0) return null;
    return meta.ownerIds[0];
  }

  return (
    <>
      {/* Stats */}
      {allCompanies.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">{allCompanies.length} total</div>
      )}

      {/* ── Toolbar ── */}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>

        <MultiFilterPopover
          label="All categories"
          options={COMPANY_CATEGORIES.map((s: CompanyCategory) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
          selected={stageFilters}
          onChange={setStageFilters}
        />

        <MultiFilterPopover
          label="All owners"
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          selected={ownerFilters}
          onChange={setOwnerFilters}
        />

        <MultiFilterPopover
          label="All products"
          options={[
            { value: "canvas", label: "Canvas" },
            { value: "sketch", label: "Sketch" },
            { value: "services", label: "Services" },
          ]}
          selected={productFilters}
          onChange={setProductFilters}
        />

        <Button size="sm" variant="outline" className="h-8 text-xs gap-1 ml-auto" onClick={() => setShowAddDialog(true)}>
          <Plus size={14} />
          Add Company
        </Button>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<BuildingsIcon size={32} />}
            title={stageFilters.size > 0 || productFilters.size > 0 || ownerFilters.size > 0 ? "No companies match filters" : "No companies yet"}
            description={stageFilters.size > 0 || productFilters.size > 0 || ownerFilters.size > 0 ? "Try adjusting your filters." : "Add your first company to get started."}
            action={
              stageFilters.size > 0 || productFilters.size > 0 || ownerFilters.size > 0 ? (
                <Button size="sm" variant="outline" onClick={() => { setStageFilters(new Set()); setProductFilters(new Set()); setOwnerFilters(new Set()); }}>
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus size={14} />
                  Add Company
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="w-5" />
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-32">Domain</div>
              <div className="w-24">Category</div>
              <div className="w-20">Owner</div>
              <div className="w-44">Next up</div>
              <div className="w-28">Last touched</div>
            </div>

            {companies.map((company) => {
              const ownerId = getCompanyOwner(company.id);
              const ownerName = ownerId ? userMap.get(ownerId) : null;
              const nextUp = nextUpData?.[company.id] ?? { type: "none" as const, label: "\u2014" };
              const lastTouched = lastTouchedData?.[company.id];

              return (
                <div
                  key={company.id}
                  className="group flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-b-0 cursor-pointer hover:bg-muted/30"
                >
                  <div className="w-5" />
                  <div className="flex-1 min-w-0" onClick={() => openCompanyDrawer(company)}>
                    <div className="text-sm font-medium truncate">{company.name}</div>
                  </div>
                  <div className="w-32 text-xs text-muted-foreground truncate" onClick={() => openCompanyDrawer(company)}>
                    {company.domain ?? "\u2014"}
                  </div>
                  <div className="w-24" onClick={(e) => e.stopPropagation()}>
                    <PipelineSelector
                      value={company.category}
                      options={COMPANY_CATEGORIES}
                      onChange={(p) => {
                        updateCompanyMutation.mutate({
                          id: company.id,
                          data: { category: (p ?? "uncategorized") as CompanyCategory },
                        });
                      }}
                    />
                  </div>
                  <div className="w-20 text-xs text-muted-foreground truncate" onClick={() => openCompanyDrawer(company)}>
                    {ownerName ?? "\u2014"}
                  </div>
                  <div className="w-44 truncate" onClick={() => openCompanyDrawer(company)}>
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
                  <div className="w-28 text-xs text-muted-foreground" onClick={() => openCompanyDrawer(company)}>
                    {lastTouched?.label ?? "\u2014"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Showing {from}&ndash;{to} of {total}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      {/* Add Company Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>Create a new company record in your CRM.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="co-name">Name *</Label>
              <Input id="co-name" placeholder="Acme Inc." value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="co-domain">Domain</Label>
              <Input id="co-domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="co-industry">Industry</Label>
              <Input id="co-industry" placeholder="SaaS" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="co-size">Size</Label>
              <Input id="co-size" placeholder="50-200" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="co-location">Location</Label>
              <Input id="co-location" placeholder="San Francisco, CA" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="co-website">Website URL</Label>
              <Input id="co-website" placeholder="https://acme.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="co-linkedin">LinkedIn URL</Label>
              <Input id="co-linkedin" placeholder="https://linkedin.com/company/acme" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="apollo">Apollo</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="email_domain">Email Domain</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
            </DialogClose>
            <Button disabled={!canSubmit || createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? (<><SpinnerGap size={16} className="animate-spin" />Adding...</>) : "Add Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Sheet open={!!drawerStack} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
        <SheetContent className="!w-auto !max-w-none p-0" showCloseButton={false}>
          {drawerStack?.type === "company" && (
            <ResizableDrawerWrapper>
              <CompanyDetailDrawer company={drawerStack.company} onClose={closeDrawer} onOpenContact={openContactFromCompany} />
            </ResizableDrawerWrapper>
          )}
          {drawerStack?.type === "contact" && (
            <ResizableDrawerWrapper>
              <ContactDetailDrawer contact={drawerStack.contact} companyName={drawerStack.fromCompany.name} onClose={closeDrawer} onBack={backToCompany} />
            </ResizableDrawerWrapper>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// Review Tab — dedup candidates + low-confidence classifications
// ══════════════════════════════════════════════════════════

// ── Dedup helpers ──

interface MatchCriteria {
  label: string;
  variant: "default" | "secondary" | "outline";
}

function parseMatchCriteria(reason: string): MatchCriteria[] {
  const criteria: MatchCriteria[] = [];
  const lower = reason.toLowerCase();

  if (lower.includes("cross-source") && lower.includes("name match")) {
    criteria.push({ label: "Cross-source name match", variant: "default" });
  } else if (lower.includes("cross-source") && lower.includes("email")) {
    criteria.push({ label: "Cross-source email match", variant: "default" });
  } else if (lower.includes("web search") || lower.includes("ai confirmed")) {
    criteria.push({ label: "Web search + AI", variant: "default" });
  } else if (lower.includes("same company") && lower.includes("nickname")) {
    criteria.push({ label: "Same company", variant: "secondary" });
    criteria.push({ label: "Nickname match", variant: "secondary" });
  } else if (lower.includes("same company") && lower.includes("compatible")) {
    criteria.push({ label: "Same company", variant: "secondary" });
    criteria.push({ label: "Name match", variant: "secondary" });
  } else {
    criteria.push({ label: reason, variant: "outline" });
  }

  return criteria;
}

function confidenceColor(confidence: string | null): string {
  switch (confidence) {
    case "high":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
    case "medium":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "low":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
    default:
      return "";
  }
}

// ── Dedup contact card ──

function DedupContactCard({ contact, label }: { contact: DedupCandidateContact; label: string }) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm font-semibold">{contact.name}</div>
      {contact.title && <div className="text-xs text-muted-foreground">{contact.title}</div>}
      {contact.companyName && (
        <div className="text-xs text-muted-foreground">{contact.companyName}</div>
      )}
      <div className="flex flex-col gap-1 pt-1">
        {contact.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <EnvelopeSimple size={12} />
            <span className="truncate">{contact.email}</span>
          </div>
        )}
        {contact.linkedinUrl && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LinkedinLogo size={12} />
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
        <Badge variant="outline" className="text-[10px]">
          {contact.source}
        </Badge>
      </div>
    </div>
  );
}

// ── Dedup candidate card ──

function DedupCandidateCard({ candidate }: { candidate: DedupCandidate }) {
  const mergeMutation = useMergeContacts();
  const dismissMutation = useDismissCandidate();
  const criteria = parseMatchCriteria(candidate.matchReason);
  const isPending = mergeMutation.isPending || dismissMutation.isPending;

  return (
    <div className="rounded-lg border border-border bg-background p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {criteria.map((c, i) => (
            <Badge key={i} variant={c.variant} className="text-xs">
              {c.label}
            </Badge>
          ))}
        </div>
        {candidate.aiConfidence && (
          <Badge
            variant="outline"
            className={cn("text-xs", confidenceColor(candidate.aiConfidence))}
          >
            {candidate.aiConfidence} confidence
          </Badge>
        )}
      </div>

      <div className="flex gap-3">
        <DedupContactCard contact={candidate.contactA} label="Contact A" />
        <DedupContactCard contact={candidate.contactB} label="Contact B" />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-muted-foreground">
          Detected {new Date(candidate.createdAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => dismissMutation.mutate(candidate.id)}
            disabled={isPending}
          >
            <X size={14} className="mr-1.5" />
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
            disabled={isPending}
          >
            <ArrowsMerge size={14} className="mr-1.5" />
            Merge
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Classification review card ──

function ClassificationReviewCard({ contact }: { contact: Contact }) {
  const confirmMutation = useConfirmClassification();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(contact.category);

  return (
    <div className="rounded-lg border border-border bg-background p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{contact.name}</div>
          {contact.title && <div className="text-xs text-muted-foreground">{contact.title}</div>}
          {(contact as Contact & { companyName?: string }).companyName && (
            <div className="text-xs text-muted-foreground">
              {(contact as Contact & { companyName?: string }).companyName}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {contact.category && (
            <PipelineBadge pipeline={contact.category as CompanyCategory} />
          )}
          {contact.aiConfidence && (
            <Badge
              variant="outline"
              className={cn("text-xs", confidenceColor(contact.aiConfidence))}
            >
              {contact.aiConfidence === "low" ? (
                <><Warning size={10} className="mr-1" />Low confidence</>
              ) : (
                <>{contact.aiConfidence} confidence</>
              )}
            </Badge>
          )}
        </div>
      </div>

      {contact.aiSummary && (
        <p className="text-xs text-muted-foreground italic">{contact.aiSummary}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Assign category:</span>
          <PipelineSelector
            value={selectedCategory}
            options={CONTACT_CATEGORIES}
            onChange={setSelectedCategory}
          />
        </div>
        <Button
          size="sm"
          disabled={!selectedCategory || confirmMutation.isPending}
          onClick={() => {
            if (selectedCategory) {
              confirmMutation.mutate({ contactId: contact.id, category: selectedCategory });
            }
          }}
        >
          {confirmMutation.isPending ? (
            <SpinnerGap size={14} className="animate-spin mr-1.5" />
          ) : (
            <CheckCircle size={14} className="mr-1.5" />
          )}
          Confirm
        </Button>
      </div>
    </div>
  );
}

// ── Review Tab ──

function ReviewTab() {
  const { data: dedupData, isLoading: dedupLoading } = usePendingDedupCandidates();
  const candidates = dedupData?.candidates ?? [];

  const { data: reviewContacts, isLoading: reviewLoading } = useNeedsReviewList();
  const classificationContacts = reviewContacts ?? [];

  const isLoading = dedupLoading || reviewLoading;
  const isEmpty = candidates.length === 0 && classificationContacts.length === 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading review items...</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
        <div>
          <p className="text-base font-medium">All clear</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No pending items to review. Duplicates and low-confidence classifications
            will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-8">
      {/* Duplicates section */}
      {candidates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CopySimple size={16} weight="fill" className="text-orange-500" />
            <h3 className="text-sm font-semibold">Possible Duplicates</h3>
            <Badge variant="secondary" className="text-xs">
              {candidates.length}
            </Badge>
          </div>
          <div className="space-y-4">
            {candidates.map((candidate) => (
              <DedupCandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        </div>
      )}

      {/* Classification review section */}
      {classificationContacts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Warning size={16} className="text-yellow-500" />
            <h3 className="text-sm font-semibold">Low Confidence Classifications</h3>
            <Badge variant="secondary" className="text-xs">
              {classificationContacts.length}
            </Badge>
          </div>
          <div className="space-y-4">
            {classificationContacts.map((contact) => (
              <ClassificationReviewCard key={contact.id} contact={contact} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
