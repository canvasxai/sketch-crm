import { useState, useMemo } from "react";
import { createRoute } from "@tanstack/react-router";
import {
  type CompanyPipeline,
  COMPANY_PIPELINES,
  type Contact,
  type Company,
  type PipelineWithStages,
  type PipelineStage,
} from "@crm/shared";
import {
  GearSix,
  Plus,
  Trash,
  DotsSixVertical,
  PencilSimple,
  X,
} from "@phosphor-icons/react";
import { useContacts } from "@/hooks/use-contacts";
import { useCompanies } from "@/hooks/use-companies";
import { useUsers } from "@/hooks/use-users";
import {
  usePipelines,
  useCreatePipeline,
  useDeletePipeline,
  useUpdatePipeline,
  useAddStage,
  useUpdateStage,
  useDeleteStage,
} from "@/hooks/use-pipelines";
import { ProductFlags } from "@/components/product-flags";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

export const pipelineRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/",
  component: PipelinePage,
});

// ── Pipeline config ──

/** Default visible pipelines — muted is hidden unless toggled on */
const DEFAULT_PIPELINES: CompanyPipeline[] = ["uncategorized", "sales", "client", "hiring"];
const ALL_PIPELINES: readonly CompanyPipeline[] = COMPANY_PIPELINES;

const pipelineColors: Record<CompanyPipeline, string> = {
  uncategorized: "bg-gray-400",
  sales: "bg-blue-500",
  client: "bg-green-500",
  connected: "bg-cyan-500",
  muted: "bg-gray-300",
  hiring: "bg-purple-500",
};

const pipelineLabels: Record<CompanyPipeline, string> = {
  uncategorized: "Uncategorized",
  sales: "Sales",
  client: "Client",
  connected: "Connected",
  muted: "Muted",
  hiring: "Hiring",
};

// ── Company card model ──

interface PipelineCard {
  companyId: string;
  companyName: string;
  company: Company | null;      // null for demo cards
  pipeline: CompanyPipeline;
  contacts: Contact[];
  primaryContact: { name: string; title: string | null };
  extraCount: number;           // "+N more"
  hasCanvas: boolean;
  hasSketch: boolean;
  hasServices: boolean;
  ownerIds: string[];
  isDemo?: boolean;
}

// ── Dummy pipeline data (shown when the DB is empty) ──

const DEMO_CARDS: PipelineCard[] = [
  {
    companyId: "demo-co-1", companyName: "Acme Corp", company: null, pipeline: "sales",
    contacts: [], primaryContact: { name: "Sarah Chen", title: "VP Engineering" }, extraCount: 1,
    hasCanvas: true, hasSketch: true, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-2", companyName: "Bloom Studio", company: null, pipeline: "sales",
    contacts: [], primaryContact: { name: "Priya Patel", title: "Head of Product" }, extraCount: 0,
    hasCanvas: false, hasSketch: true, hasServices: true, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-3", companyName: "Nova Design", company: null, pipeline: "sales",
    contacts: [], primaryContact: { name: "Alex Rivera", title: "Design Lead" }, extraCount: 0,
    hasCanvas: true, hasSketch: false, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-4", companyName: "CloudScale", company: null, pipeline: "uncategorized",
    contacts: [], primaryContact: { name: "Maria Santos", title: "VP Operations" }, extraCount: 0,
    hasCanvas: false, hasSketch: false, hasServices: true, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-5", companyName: "Pixel Labs", company: null, pipeline: "client",
    contacts: [], primaryContact: { name: "Tom Wilson", title: "CEO" }, extraCount: 0,
    hasCanvas: true, hasSketch: true, hasServices: true, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-6", companyName: "TechForge", company: null, pipeline: "client",
    contacts: [], primaryContact: { name: "Nina Kowalski", title: "Engineering Manager" }, extraCount: 0,
    hasCanvas: true, hasSketch: false, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-7", companyName: "ArtFlow", company: null, pipeline: "hiring",
    contacts: [], primaryContact: { name: "David Park", title: "Founder" }, extraCount: 0,
    hasCanvas: false, hasSketch: true, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-8", companyName: "BigCo Inc", company: null, pipeline: "muted",
    contacts: [], primaryContact: { name: "Emma Taylor", title: "Product Manager" }, extraCount: 0,
    hasCanvas: false, hasSketch: false, hasServices: false, ownerIds: [], isDemo: true,
  },
];

// ── Component ──

function PipelinePage() {
  const isMobile = useIsMobile();

  // ── Filters (multi-select) ──
  const [ownerFilters, setOwnerFilters] = useState<Set<string>>(new Set());
  const [productFilters, setProductFilters] = useState<Set<string>>(new Set());
  const [showMuted, setShowMuted] = useState(false);

  const visiblePipelines = showMuted ? ALL_PIPELINES : DEFAULT_PIPELINES;

  // ── Queries ──
  const { data: contactsData, isLoading: contactsLoading } = useContacts({ limit: 500 });
  const allContacts = contactsData?.contacts ?? [];

  const { data: companiesData } = useCompanies({ limit: 500 });
  const companyMap = useMemo(
    () => new Map((companiesData?.companies ?? []).map((c) => [c.id, c])),
    [companiesData],
  );

  const { data: usersData } = useUsers();
  const users = usersData?.users ?? [];
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as [string, string])),
    [users],
  );

  // ── Build company-grouped pipeline cards ──
  const pipelineCards = useMemo(() => {
    // Group contacts by companyId
    const byCompany = new Map<string, Contact[]>();
    const orphans: Contact[] = []; // contacts without a company

    for (const c of allContacts) {
      if (c.companyId) {
        const existing = byCompany.get(c.companyId) ?? [];
        existing.push(c);
        byCompany.set(c.companyId, existing);
      } else {
        orphans.push(c);
      }
    }

    const cards: PipelineCard[] = [];

    // Company cards — use company.pipeline for the Kanban column
    for (const [companyId, contacts] of byCompany) {
      const company = companyMap.get(companyId) ?? null;
      const companyPipeline: CompanyPipeline = company?.pipeline ?? "uncategorized";
      const primary = contacts[0];
      const ownerIds = [...new Set(contacts.map((c) => c.createdByUserId).filter(Boolean))] as string[];

      cards.push({
        companyId,
        companyName: company?.name ?? "Unknown Company",
        company,
        pipeline: companyPipeline,
        contacts,
        primaryContact: { name: primary.name, title: primary.title },
        extraCount: contacts.length - 1,
        hasCanvas: contacts.some((c) => c.isCanvasUser),
        hasSketch: contacts.some((c) => c.isSketchUser),
        hasServices: contacts.some((c) => c.usesServices),
        ownerIds,
      });
    }

    // Orphan contacts as individual cards (no company → uncategorized)
    for (const c of orphans) {
      cards.push({
        companyId: c.id,
        companyName: c.name,
        company: null,
        pipeline: "uncategorized",
        contacts: [c],
        primaryContact: { name: c.name, title: c.title },
        extraCount: 0,
        hasCanvas: c.isCanvasUser,
        hasSketch: c.isSketchUser,
        hasServices: c.usesServices,
        ownerIds: c.createdByUserId ? [c.createdByUserId] : [],
      });
    }

    return cards;
  }, [allContacts, companyMap]);

  // ── Apply filters ──
  const filteredCards = useMemo(() => {
    return pipelineCards.filter((card) => {
      // Owner filter
      if (ownerFilters.size > 0) {
        if (!card.ownerIds.some((id) => ownerFilters.has(id))) return false;
      }
      // Product filter
      if (productFilters.size > 0) {
        let hasMatch = false;
        if (productFilters.has("canvas") && card.hasCanvas) hasMatch = true;
        if (productFilters.has("sketch") && card.hasSketch) hasMatch = true;
        if (productFilters.has("services") && card.hasServices) hasMatch = true;
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [pipelineCards, ownerFilters, productFilters]);

  // ── Demo mode ──
  const hasPipelineCards = filteredCards.length > 0;
  const isDemoMode = !contactsLoading && !hasPipelineCards && ownerFilters.size === 0 && productFilters.size === 0;

  const activeCards = isDemoMode ? DEMO_CARDS : filteredCards;

  // ── Group cards by pipeline ──
  const grouped = useMemo(() => {
    const map: Record<string, PipelineCard[]> = {};
    for (const p of ALL_PIPELINES) {
      map[p] = [];
    }
    for (const card of activeCards) {
      if (map[card.pipeline]) {
        map[card.pipeline].push(card);
      }
    }
    return map;
  }, [activeCards]);

  // ── Drawer stack (same pattern as companies page) ──
  type DrawerStack =
    | { type: "company"; company: Company }
    | { type: "contact"; contact: Contact; fromCompany: Company };

  const [drawerStack, setDrawerStack] = useState<DrawerStack | null>(null);

  function openCompanyDrawer(card: PipelineCard) {
    if (card.isDemo || !card.company) return;
    setDrawerStack({ type: "company", company: card.company });
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

  // ── Loading skeleton ──
  if (contactsLoading) {
    return (
      <div>
        <div className="px-6 pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">Pipeline</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Track companies through your sales funnel.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
        </div>
        <div className="flex gap-4 px-6 py-6">
          {DEFAULT_PIPELINES.map((p) => (
            <div key={p} className="flex flex-1 flex-col">
              <Skeleton className="h-6 w-32 mb-3" />
              <div className="space-y-2">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-6 pt-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">Pipeline</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track companies through your sales funnel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MultiFilterPopover
              label="All owners"
              options={users.map((u) => ({
                value: u.id,
                label: u.name,
              }))}
              selected={ownerFilters}
              onChange={setOwnerFilters}
              align="end"
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
              align="end"
            />
            <PipelineSettingsDialog />
          </div>
        </div>

        {/* Lost toggle + demo hint */}
        <div className="mt-2 flex items-center justify-between">
          {isDemoMode ? (
            <span className="text-[11px] text-muted-foreground italic">
              Showing sample data — add contacts with pipeline stages to see your real pipeline.
            </span>
          ) : (
            <span />
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMuted}
              onChange={(e) => setShowMuted(e.target.checked)}
              className="size-3 rounded border-border accent-primary cursor-pointer"
            />
            Show muted
          </label>
        </div>
      </div>

      {isMobile ? (
        <div className="px-6 py-6">
          <Tabs defaultValue="uncategorized">
            <TabsList className="w-full">
              {visiblePipelines.map((p) => (
                <TabsTrigger key={p} value={p} className="text-xs">
                  {pipelineLabels[p]} ({grouped[p].length})
                </TabsTrigger>
              ))}
            </TabsList>
            {visiblePipelines.map((p) => (
              <TabsContent key={p} value={p} className="mt-4 space-y-2">
                {grouped[p].map((card) => (
                  <PipelineCompanyCard
                    key={card.companyId}
                    card={card}
                    userMap={userMap}
                    onClick={() => openCompanyDrawer(card)}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      ) : (
        <div className="flex gap-4 px-6 py-6 h-[calc(100vh-130px)]">
          {visiblePipelines.map((p) => (
            <div key={p} className="flex flex-1 flex-col min-w-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={cn("size-2 rounded-full", pipelineColors[p])} />
                <span className="text-sm font-medium">{pipelineLabels[p]}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                  {grouped[p].length}
                </Badge>
              </div>

              {/* Cards list */}
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {grouped[p].map((card) => (
                    <PipelineCompanyCard
                      key={card.companyId}
                      card={card}
                      userMap={userMap}
                      onClick={() => openCompanyDrawer(card)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      )}

      {/* ── Company / Contact Detail Drawer ── */}
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

// ── Pipeline card (company-level) ──

function PipelineCompanyCard({
  card,
  userMap,
  onClick,
}: {
  card: PipelineCard;
  userMap: Map<string, string>;
  onClick: () => void;
}) {
  const ownerName = card.ownerIds[0] ? (userMap.get(card.ownerIds[0]) ?? null) : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 transition-colors",
        card.isDemo ? "opacity-70" : "cursor-pointer hover:bg-muted/50",
      )}
      onClick={card.isDemo ? undefined : onClick}
    >
      {/* Company name + owner */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium truncate">{card.companyName}</p>
        {ownerName && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{ownerName}</span>
        )}
      </div>

      {/* Primary contact */}
      <p className="text-xs text-muted-foreground mt-0.5 truncate">
        {card.primaryContact.name}
        {card.primaryContact.title && ` \u00B7 ${card.primaryContact.title}`}
      </p>

      {/* +N more */}
      {card.extraCount > 0 && (
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          +{card.extraCount} more {card.extraCount === 1 ? "contact" : "contacts"}
        </p>
      )}

      {/* Product flags */}
      {(card.hasCanvas || card.hasSketch || card.hasServices) && (
        <div className="mt-2">
          <ProductFlags
            isCanvasUser={card.hasCanvas}
            isSketchUser={card.hasSketch}
            usesServices={card.hasServices}
          />
        </div>
      )}
    </div>
  );
}

// ── Pipeline Settings Dialog ──

const STAGE_TYPE_LABELS: Record<string, string> = {
  active: "Active",
  won: "Won",
  lost: "Lost",
};

const STAGE_TYPE_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

function PipelineSettingsDialog() {
  const { data: pipelinesData, isLoading } = usePipelines();
  const productPipelines = pipelinesData?.pipelines ?? [];

  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const deletePipeline = useDeletePipeline();
  const addStage = useAddStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();

  const [newPipelineName, setNewPipelineName] = useState("");
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [newStageType, setNewStageType] = useState("active");
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editStageLabel, setEditStageLabel] = useState("");
  const [editingPipeline, setEditingPipeline] = useState<string | null>(null);
  const [editPipelineName, setEditPipelineName] = useState("");

  function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    createPipeline.mutate(
      { name, position: productPipelines.length },
      { onSuccess: () => setNewPipelineName("") },
    );
  }

  function handleAddStage(pipelineId: string, stages: PipelineStage[]) {
    const label = newStageLabel.trim();
    if (!label) return;
    addStage.mutate(
      { pipelineId, label, stageType: newStageType, position: stages.length },
      {
        onSuccess: () => {
          setNewStageLabel("");
          setNewStageType("active");
          setAddingStageFor(null);
        },
      },
    );
  }

  function handleDeleteStage(stageId: string) {
    deleteStage.mutate(stageId);
  }

  function handleDeletePipeline(id: string) {
    deletePipeline.mutate(id);
  }

  function startEditStage(stage: PipelineStage) {
    setEditingStage(stage.id);
    setEditStageLabel(stage.label);
  }

  function commitEditStage(stageId: string) {
    const label = editStageLabel.trim();
    if (label) {
      updateStage.mutate({ stageId, label });
    }
    setEditingStage(null);
  }

  function startEditPipeline(pipeline: PipelineWithStages) {
    setEditingPipeline(pipeline.id);
    setEditPipelineName(pipeline.name);
  }

  function commitEditPipeline(id: string) {
    const name = editPipelineName.trim();
    if (name) {
      updatePipeline.mutate({ id, name });
    }
    setEditingPipeline(null);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <GearSix size={12} />
          Settings
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Product Pipelines</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configure deal pipelines and their stages for tracking opportunities.
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {productPipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                className="rounded-lg border border-border"
              >
                {/* Pipeline header */}
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                  {editingPipeline === pipeline.id ? (
                    <Input
                      value={editPipelineName}
                      onChange={(e) => setEditPipelineName(e.target.value)}
                      onBlur={() => commitEditPipeline(pipeline.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEditPipeline(pipeline.id);
                        if (e.key === "Escape") setEditingPipeline(null);
                      }}
                      className="h-7 text-sm font-medium"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {pipeline.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {pipeline.stages.length} stages
                      </Badge>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditPipeline(pipeline)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Rename pipeline"
                    >
                      <PencilSimple size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePipeline(pipeline.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"
                      title="Delete pipeline"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                </div>

                {/* Stages list */}
                <div className="divide-y divide-border">
                  {pipeline.stages
                    .sort((a, b) => a.position - b.position)
                    .map((stage) => (
                      <div
                        key={stage.id}
                        className="flex items-center gap-2 px-3 py-2 group"
                      >
                        <DotsSixVertical
                          size={14}
                          className="text-muted-foreground/40 shrink-0"
                        />

                        {editingStage === stage.id ? (
                          <Input
                            value={editStageLabel}
                            onChange={(e) => setEditStageLabel(e.target.value)}
                            onBlur={() => commitEditStage(stage.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                commitEditStage(stage.id);
                              if (e.key === "Escape") setEditingStage(null);
                            }}
                            className="h-6 text-xs flex-1"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="text-xs flex-1 cursor-pointer"
                            onClick={() => startEditStage(stage)}
                          >
                            {stage.label}
                          </span>
                        )}

                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] px-1.5 py-0 border-0",
                            STAGE_TYPE_COLORS[stage.stageType] ?? "",
                          )}
                        >
                          {STAGE_TYPE_LABELS[stage.stageType] ??
                            stage.stageType}
                        </Badge>

                        <button
                          type="button"
                          onClick={() => handleDeleteStage(stage.id)}
                          className="rounded p-0.5 text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-red-600 transition-colors"
                          title="Remove stage"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                </div>

                {/* Add stage */}
                {addingStageFor === pipeline.id ? (
                  <div className="border-t border-border px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Stage name"
                        value={newStageLabel}
                        onChange={(e) => setNewStageLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleAddStage(pipeline.id, pipeline.stages);
                          if (e.key === "Escape") setAddingStageFor(null);
                        }}
                        className="h-7 text-xs flex-1"
                        autoFocus
                      />
                      <Select
                        value={newStageType}
                        onValueChange={setNewStageType}
                      >
                        <SelectTrigger className="h-7 w-[90px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active" className="text-xs">
                            Active
                          </SelectItem>
                          <SelectItem value="won" className="text-xs">
                            Won
                          </SelectItem>
                          <SelectItem value="lost" className="text-xs">
                            Lost
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() =>
                          handleAddStage(pipeline.id, pipeline.stages)
                        }
                        disabled={
                          !newStageLabel.trim() || addStage.isPending
                        }
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setAddingStageFor(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingStageFor(pipeline.id);
                      setNewStageLabel("");
                      setNewStageType("active");
                    }}
                    className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus size={12} />
                    Add stage
                  </button>
                )}
              </div>
            ))}

            {/* Add new pipeline */}
            <div className="rounded-lg border border-dashed border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="New pipeline name"
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreatePipeline();
                  }}
                  className="h-8 text-sm flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreatePipeline}
                  disabled={
                    !newPipelineName.trim() || createPipeline.isPending
                  }
                  className="h-8"
                >
                  <Plus size={14} />
                  Add pipeline
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
