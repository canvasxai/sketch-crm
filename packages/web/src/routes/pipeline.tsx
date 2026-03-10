import { useState, useMemo } from "react";
import { createRoute } from "@tanstack/react-router";
import { type FunnelStage, type Contact, type Company } from "@crm/shared";
import { useContacts } from "@/hooks/use-contacts";
import { useCompanies } from "@/hooks/use-companies";
import { useUsers } from "@/hooks/use-users";
import { ProductFlags } from "@/components/product-flags";
import { MultiFilterPopover } from "@/components/multi-filter-popover";
import { ResizableDrawerWrapper } from "@/components/resizable-drawer-wrapper";
import { CompanyDetailDrawer } from "@/components/company-detail-drawer";
import { ContactDetailDrawer } from "@/routes/contacts";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getTopStage } from "@/lib/drawer-helpers";
import { dashboardRoute } from "./dashboard";

export const pipelineRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/",
  component: PipelinePage,
});

// ── Stage config ──

/** Default visible stages — lost is hidden unless toggled on */
const DEFAULT_STAGES: FunnelStage[] = ["qualified", "opportunity", "customer", "dormant"];
const ALL_PIPELINE_STAGES: FunnelStage[] = ["qualified", "opportunity", "customer", "dormant", "lost"];

const stageColors: Record<FunnelStage, string> = {
  new: "bg-blue-500",
  qualified: "bg-purple-500",
  opportunity: "bg-amber-500",
  customer: "bg-green-500",
  dormant: "bg-gray-400",
  lost: "bg-red-500",
};

const stageLabels: Record<FunnelStage, string> = {
  new: "New",
  qualified: "Qualified",
  opportunity: "Opportunity",
  customer: "Customer",
  dormant: "Dormant",
  lost: "Lost",
};

// ── Company card model ──

interface PipelineCard {
  companyId: string;
  companyName: string;
  company: Company | null;      // null for demo cards
  topStage: FunnelStage;
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
    companyId: "demo-co-1", companyName: "Acme Corp", company: null, topStage: "qualified",
    contacts: [], primaryContact: { name: "Sarah Chen", title: "VP Engineering" }, extraCount: 1,
    hasCanvas: true, hasSketch: true, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-2", companyName: "Bloom Studio", company: null, topStage: "opportunity",
    contacts: [], primaryContact: { name: "Priya Patel", title: "Head of Product" }, extraCount: 0,
    hasCanvas: false, hasSketch: true, hasServices: true, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-3", companyName: "Nova Design", company: null, topStage: "opportunity",
    contacts: [], primaryContact: { name: "Alex Rivera", title: "Design Lead" }, extraCount: 0,
    hasCanvas: true, hasSketch: false, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-4", companyName: "CloudScale", company: null, topStage: "opportunity",
    contacts: [], primaryContact: { name: "Maria Santos", title: "VP Operations" }, extraCount: 0,
    hasCanvas: false, hasSketch: false, hasServices: true, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-5", companyName: "Pixel Labs", company: null, topStage: "customer",
    contacts: [], primaryContact: { name: "Tom Wilson", title: "CEO" }, extraCount: 0,
    hasCanvas: true, hasSketch: true, hasServices: true, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-6", companyName: "TechForge", company: null, topStage: "customer",
    contacts: [], primaryContact: { name: "Nina Kowalski", title: "Engineering Manager" }, extraCount: 0,
    hasCanvas: true, hasSketch: false, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-7", companyName: "ArtFlow", company: null, topStage: "dormant",
    contacts: [], primaryContact: { name: "David Park", title: "Founder" }, extraCount: 0,
    hasCanvas: false, hasSketch: true, hasServices: false, ownerIds: [], isDemo: true,
  },
  {
    companyId: "demo-co-8", companyName: "BigCo Inc", company: null, topStage: "lost",
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
  const [showLost, setShowLost] = useState(false);

  const visibleStages = showLost ? ALL_PIPELINE_STAGES : DEFAULT_STAGES;

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
      if (!ALL_PIPELINE_STAGES.includes(c.funnelStage)) continue; // skip "new"
      if (c.companyId) {
        const existing = byCompany.get(c.companyId) ?? [];
        existing.push(c);
        byCompany.set(c.companyId, existing);
      } else {
        orphans.push(c);
      }
    }

    const cards: PipelineCard[] = [];

    // Company cards
    for (const [companyId, contacts] of byCompany) {
      const company = companyMap.get(companyId) ?? null;
      const stages = contacts.map((c) => c.funnelStage);
      const topStage = getTopStage(stages) ?? "qualified";
      const primary = contacts[0];
      const ownerIds = [...new Set(contacts.map((c) => c.createdByUserId).filter(Boolean))] as string[];

      cards.push({
        companyId,
        companyName: company?.name ?? "Unknown Company",
        company,
        topStage,
        contacts,
        primaryContact: { name: primary.name, title: primary.title },
        extraCount: contacts.length - 1,
        hasCanvas: contacts.some((c) => c.isCanvasUser),
        hasSketch: contacts.some((c) => c.isSketchUser),
        hasServices: contacts.some((c) => c.usesServices),
        ownerIds,
      });
    }

    // Orphan contacts as individual cards
    for (const c of orphans) {
      cards.push({
        companyId: c.id,
        companyName: c.name,
        company: null,
        topStage: c.funnelStage,
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

  // ── Group cards by stage ──
  const grouped = useMemo(() => {
    const map: Record<string, PipelineCard[]> = {};
    for (const stage of ALL_PIPELINE_STAGES) {
      map[stage] = [];
    }
    for (const card of activeCards) {
      if (map[card.topStage]) {
        map[card.topStage].push(card);
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
          {DEFAULT_STAGES.map((stage) => (
            <div key={stage} className="flex flex-1 flex-col">
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
              checked={showLost}
              onChange={(e) => setShowLost(e.target.checked)}
              className="size-3 rounded border-border accent-primary cursor-pointer"
            />
            Show lost
          </label>
        </div>
      </div>

      {isMobile ? (
        <div className="px-6 py-6">
          <Tabs defaultValue="qualified">
            <TabsList className="w-full">
              {visibleStages.map((stage) => (
                <TabsTrigger key={stage} value={stage} className="text-xs">
                  {stageLabels[stage]} ({grouped[stage].length})
                </TabsTrigger>
              ))}
            </TabsList>
            {visibleStages.map((stage) => (
              <TabsContent key={stage} value={stage} className="mt-4 space-y-2">
                {grouped[stage].map((card) => (
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
          {visibleStages.map((stage) => (
            <div key={stage} className="flex flex-1 flex-col min-w-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={cn("size-2 rounded-full", stageColors[stage])} />
                <span className="text-sm font-medium">{stageLabels[stage]}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                  {grouped[stage].length}
                </Badge>
              </div>

              {/* Cards list */}
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {grouped[stage].map((card) => (
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
