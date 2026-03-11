import { useEffect, useMemo, useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { COMPANY_PIPELINES, type Company, type Contact, type CompanyPipeline } from "@crm/shared";
import {
  BuildingsIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";

import { useCompanies, useCreateCompany, useUpdateCompany } from "@/hooks/use-companies";
import { useContacts } from "@/hooks/use-contacts";
import { useUsers } from "@/hooks/use-users";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PipelineSelector } from "@/components/pipeline-selector";
import { MultiFilterPopover } from "@/components/multi-filter-popover";
import { ResizableDrawerWrapper } from "@/components/resizable-drawer-wrapper";
import { CompanyDetailDrawer } from "@/components/company-detail-drawer";
import { ContactDetailDrawer } from "@/routes/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { useCompaniesNextUp, useCompaniesLastTouched } from "@/hooks/use-insights";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

export const companiesRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/companies",
  component: CompaniesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    open: (search.open as string) || "",
  }),
});

function CompaniesPage() {
  // ── Search state ──
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Filter state (multi-select) ──
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set());
  const [productFilters, setProductFilters] = useState<Set<string>>(new Set());
  const [ownerFilters, setOwnerFilters] = useState<Set<string>>(new Set());

  // ── Queries ──
  const { data, isLoading } = useCompanies({
    search: debouncedSearch || undefined,
    limit: 500,
  });

  const allCompanies = data?.companies ?? [];

  const { data: contactsData } = useContacts({ limit: 1000 });

  const { data: usersData } = useUsers();
  const users = usersData?.users ?? [];
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as [string, string])),
    [users],
  );

  // ── Per-company contact data (stages, names, owners, products) ──
  type CompanyMeta = {
    names: string[];
    ownerIds: string[];
    hasCanvas: boolean;
    hasSketch: boolean;
    hasServices: boolean;
  };

  const companyContactsMap = useMemo(() => {
    const map = new Map<string, CompanyMeta>();
    for (const c of contactsData?.contacts ?? []) {
      if (c.companyId) {
        const existing = map.get(c.companyId) ?? {
          names: [],
          ownerIds: [],
          hasCanvas: false,
          hasSketch: false,
          hasServices: false,
        };
        existing.names.push(c.name);
        if (c.createdByUserId && !existing.ownerIds.includes(c.createdByUserId)) {
          existing.ownerIds.push(c.createdByUserId);
        }
        if (c.isCanvasUser) existing.hasCanvas = true;
        if (c.isSketchUser) existing.hasSketch = true;
        if (c.usesServices) existing.hasServices = true;
        map.set(c.companyId, existing);
      }
    }
    return map;
  }, [contactsData]);

  // ── Client-side filtering (multi-select) ──
  const filteredCompanies = useMemo(() => {
    return allCompanies.filter((company) => {
      const meta = companyContactsMap.get(company.id);

      // Pipeline filter (any selected pipeline matches)
      if (stageFilters.size > 0) {
        if (!stageFilters.has(company.pipeline)) return false;
      }

      // Product filter (any selected product matches)
      if (productFilters.size > 0) {
        if (!meta) return false;
        let hasMatch = false;
        if (productFilters.has("canvas") && meta.hasCanvas) hasMatch = true;
        if (productFilters.has("sketch") && meta.hasSketch) hasMatch = true;
        if (productFilters.has("services") && meta.hasServices) hasMatch = true;
        if (!hasMatch) return false;
      }

      // Owner filter (any selected owner matches)
      if (ownerFilters.size > 0) {
        if (!meta) return false;
        if (!meta.ownerIds.some((id) => ownerFilters.has(id))) return false;
      }

      return true;
    });
  }, [allCompanies, companyContactsMap, stageFilters, productFilters, ownerFilters]);

  // ── Pagination (client-side on filtered results) ──
  const limit = 20;
  const [page, setPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [stageFilters, productFilters, ownerFilters, debouncedSearch]);

  const total = filteredCompanies.length;
  const offset = (page - 1) * limit;
  const companies = filteredCompanies.slice(offset, offset + limit);

  // ── Batch insights for current page ──
  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);
  const { data: nextUpData } = useCompaniesNextUp(companyIds);
  const { data: lastTouchedData } = useCompaniesLastTouched(companyIds);

  // ── Selection state ──
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [filteredCompanies.length, page]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === companies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(companies.map((c) => c.id)));
    }
  }

  const allSelected = companies.length > 0 && selected.size === companies.length;

  // ── Drawer stack ──
  type DrawerStack =
    | { type: "company"; company: Company }
    | { type: "contact"; contact: Contact; fromCompany: Company };

  const [drawerStack, setDrawerStack] = useState<DrawerStack | null>(null);

  function openCompanyDrawer(company: Company) {
    setDrawerStack({ type: "company", company });
  }

  function openContactFromCompany(contact: Contact) {
    if (drawerStack?.type === "company") {
      setDrawerStack({ type: "contact", contact, fromCompany: drawerStack.company });
    }
  }

  function backToCompany() {
    if (drawerStack?.type === "contact") {
      setDrawerStack({ type: "company", company: drawerStack.fromCompany });
    }
  }

  function closeDrawer() {
    setDrawerStack(null);
  }

  // Handle deep-link via ?open= search param
  const { open: openCompanyId } = companiesRoute.useSearch();
  useEffect(() => {
    if (openCompanyId && companies.length > 0) {
      const found = companies.find((c) => c.id === openCompanyId);
      if (found) openCompanyDrawer(found);
    }
  }, [openCompanyId, companies]);

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

  const createMutation = useCreateCompany();
  const updateCompanyMutation = useUpdateCompany();
  const canSubmit = name.trim().length > 0;

  function resetAndClose() {
    setName("");
    setDomain("");
    setIndustry("");
    setSize("");
    setLocation("");
    setWebsiteUrl("");
    setLinkedinUrl("");
    setSource("");
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

  // ── Pagination helpers ──
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const hasPrev = page > 1;
  const hasNext = offset + limit < total;

  // ── Derive primary owner for a company (most-represented creator) ──
  function getCompanyOwner(companyId: string): string | null {
    const meta = companyContactsMap.get(companyId);
    if (!meta || meta.ownerIds.length === 0) return null;
    return meta.ownerIds[0]; // first owner
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Companies</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your company accounts — filter by stage, product, and owner.</p>
        </div>
        <div className="flex items-center gap-3">
          {allCompanies.length > 0 && (
            <span className="text-xs text-muted-foreground">{allCompanies.length} total</span>
          )}
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <PlusIcon size={16} />
            Add Company
          </Button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="mt-5 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          label="All owners"
          options={users.map((u) => ({
            value: u.id,
            label: u.name,
          }))}
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
                  <PlusIcon size={16} />
                  Add Company
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-border bg-card">
            {/* Header row */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="w-5" />
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-32">Domain</div>
              <div className="w-24">Pipeline</div>
              <div className="w-20">Owner</div>
              <div className="w-44">Next up</div>
              <div className="w-28">Last touched</div>
            </div>

            {/* Data rows */}
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
                      value={company.pipeline}
                      options={COMPANY_PIPELINES}
                      onChange={(p) => {
                        updateCompanyMutation.mutate({
                          id: company.id,
                          data: { pipeline: (p ?? "uncategorized") as CompanyPipeline },
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
            <span className="text-sm text-muted-foreground">
              Showing {from}&ndash;{to} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Add Company Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>
              Create a new company record in your CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="company-name">Name *</Label>
              <Input
                id="company-name"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-domain">Domain</Label>
              <Input
                id="company-domain"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-industry">Industry</Label>
              <Input
                id="company-industry"
                placeholder="SaaS"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-size">Size</Label>
              <Input
                id="company-size"
                placeholder="50-200"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-location">Location</Label>
              <Input
                id="company-location"
                placeholder="San Francisco, CA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-website">Website URL</Label>
              <Input
                id="company-website"
                placeholder="https://acme.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-linkedin">LinkedIn URL</Label>
              <Input
                id="company-linkedin"
                placeholder="https://linkedin.com/company/acme"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
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
              <Button variant="outline" onClick={resetAndClose}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? (
                <>
                  <SpinnerGapIcon size={16} className="animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Company"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer (Company or Contact) */}
      <Sheet
        open={!!drawerStack}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
      >
        <SheetContent className="!w-auto !max-w-none p-0" showCloseButton={false}>
          {drawerStack?.type === "company" && (
            <ResizableDrawerWrapper>
              <CompanyDetailDrawer
                company={drawerStack.company}
                onClose={closeDrawer}
                onOpenContact={openContactFromCompany}
              />
            </ResizableDrawerWrapper>
          )}
          {drawerStack?.type === "contact" && (
            <ResizableDrawerWrapper>
              <ContactDetailDrawer
                contact={drawerStack.contact}
                companyName={drawerStack.fromCompany.name}
                onClose={closeDrawer}
                onBack={backToCompany}
              />
            </ResizableDrawerWrapper>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}
