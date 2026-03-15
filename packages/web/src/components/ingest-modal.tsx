import {
  COMPANY_PIPELINES,
  CONTACT_SOURCES,
  type CompanyPipeline,
  type ContactPipeline,
  type ContactSource,
  type DedupCandidateContact,
} from "@crm/shared";
import {
  ArrowLeft,
  ArrowsMerge,
  CalendarBlank,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  EnvelopeSimple,
  FileText,
  Headset,
  LinkedinLogo,
  Plus,
  Sparkle,
  SpinnerGap,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useRef, useReducer, useState, useEffect } from "react";
import type { DateRange } from "react-day-picker";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanies } from "@/hooks/use-companies";
import { useCreateContact } from "@/hooks/use-contacts";
import {
  usePendingDedupCandidates,
  useMergeContacts,
  useDismissCandidate,
} from "@/hooks/use-dedup-candidates";
import { useUploadCsv } from "@/hooks/use-ingestion";
import { useSession } from "@/hooks/use-auth";
import {
  useAimfoxBackfill,
  useCancelAimfoxBackfill,
  useCancelGmailSync,
  useFirefliesSync,
  useCancelFirefliesSync,
  useGmailSync,
  useSourceStatus,
} from "@/hooks/use-integrations";
import { api } from "@/lib/api";
import { toast } from "sonner";

// ── Constants ──

const CSV_SCHEMA = [
  { column: "name", required: true, example: "Jane Smith" },
  { column: "email", required: true, example: "jane@acme.com" },
  { column: "phone", required: false, example: "+1-555-0123" },
  { column: "title", required: false, example: "VP of Engineering" },
  { column: "linkedin_url", required: false, example: "https://linkedin.com/in/janesmith" },
  { column: "company", required: false, example: "Acme Corp" },
  { column: "source", required: false, example: "linkedin" },
];

const SCHEMA_MARKDOWN = `## CSV Import Schema

Your CSV file should have the following columns (header row required):

| Column | Type | Required | Description | Example |
|--------|------|----------|-------------|---------|
| name | text | Yes* | Full name of the contact | Jane Smith |
| email | text | Yes* | Email address | jane@acme.com |
| phone | text | No | Phone number | +1-555-0123 |
| title | text | No | Job title | VP of Engineering |
| linkedin_url | text | No | LinkedIn profile URL | https://linkedin.com/in/janesmith |
| company | text | No | Company name | Acme Corp |
| source | text | No | Lead source (gmail, linkedin, manual, etc.) | linkedin |

*At least one of name or email is required per row.

### Notes
- Companies are automatically created from email domains (e.g., jane@acme.com creates "Acme")
- Contacts are deduplicated by email address
- Column headers are case-insensitive and support common aliases (e.g., "full_name", "e-mail", "job_title", "organization")
- If source is omitted, contacts default to "manual"
`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Types ──

type IngestionSource = "linkedin" | "gmail" | "firefly" | "csv" | "single-contact";
type ModalStep = "source-select" | "source-config" | "ingesting" | "dedup-review" | "classify-prompt";

interface ImportResult {
  contactsCreated: number;
  contactsUpdated: number;
  contactsSkipped: number;
  companiesCreated: number;
  activitiesCreated: number;
  errors: string[];
}

interface IngestState {
  step: ModalStep;
  source: IngestionSource | null;
  csvResult: ImportResult | null;
  error: string | null;
}

type IngestAction =
  | { type: "SELECT_SOURCE"; source: IngestionSource }
  | { type: "GO_BACK" }
  | { type: "START_INGESTION" }
  | { type: "INGESTION_COMPLETE"; csvResult?: ImportResult }
  | { type: "INGESTION_ERROR"; error: string }
  | { type: "FINISH_DEDUP" }
  | { type: "RESET" };

const initialState: IngestState = {
  step: "source-select",
  source: null,
  csvResult: null,
  error: null,
};

function ingestReducer(state: IngestState, action: IngestAction): IngestState {
  switch (action.type) {
    case "SELECT_SOURCE":
      return { ...state, source: action.source, step: "source-config", error: null };
    case "GO_BACK":
      if (state.step === "source-config") return { ...initialState };
      return state;
    case "START_INGESTION":
      return { ...state, step: "ingesting", error: null };
    case "INGESTION_COMPLETE":
      return { ...state, step: "dedup-review", csvResult: action.csvResult ?? null };
    case "INGESTION_ERROR":
      return { ...state, step: "source-config", error: action.error };
    case "FINISH_DEDUP":
      return { ...state, step: "classify-prompt" };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ── Step titles ──

function getStepTitle(state: IngestState): string {
  switch (state.step) {
    case "source-select":
      return "Ingest Contacts";
    case "source-config":
      switch (state.source) {
        case "linkedin": return "Import LinkedIn";
        case "gmail": return "Import Gmail";
        case "firefly": return "Import Fireflies";
        case "csv": return "Import CSV";
        case "single-contact": return "Add Contact";
        default: return "Configure Import";
      }
    case "ingesting":
      return "Importing...";
    case "dedup-review":
      return "Review Duplicates";
    case "classify-prompt":
      return "AI Classification";
  }
}

// ── Main Modal ──

export function IngestModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, dispatch] = useReducer(ingestReducer, initialState);

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      dispatch({ type: "RESET" });
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl h-[70vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state.step !== "source-select" && state.step !== "classify-prompt" && (
              <button
                type="button"
                onClick={() => {
                  if (state.step === "source-config") dispatch({ type: "GO_BACK" });
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                disabled={state.step !== "source-config"}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            {getStepTitle(state)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {state.step === "source-select" && (
            <IngestSourceSelect dispatch={dispatch} />
          )}
          {state.step === "source-config" && (
            <IngestSourceConfig source={state.source!} state={state} dispatch={dispatch} onClose={() => handleClose(false)} />
          )}
          {state.step === "ingesting" && (
            <IngestProgress source={state.source!} dispatch={dispatch} />
          )}
          {state.step === "dedup-review" && (
            <IngestDedupReview csvResult={state.csvResult} dispatch={dispatch} />
          )}
          {state.step === "classify-prompt" && (
            <IngestClassifyPrompt onClose={() => handleClose(false)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step 1: Source Selection ──

const SOURCE_CARDS: Array<{
  id: IngestionSource;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  comingSoon?: boolean;
}> = [
  {
    id: "linkedin",
    icon: <LinkedinLogo size={20} weight="fill" className="text-blue-600" />,
    iconBg: "bg-blue-600/10",
    title: "LinkedIn",
    description: "Import leads from AIMFOX",
  },
  {
    id: "gmail",
    icon: <EnvelopeSimple size={20} className="text-red-500" />,
    iconBg: "bg-red-500/10",
    title: "Gmail",
    description: "Import historical emails",
  },
  {
    id: "firefly",
    icon: <Headset size={20} className="text-purple-500" />,
    iconBg: "bg-purple-500/10",
    title: "Fireflies",
    description: "Meeting transcripts",
  },
  {
    id: "csv",
    icon: <UploadSimple size={20} className="text-orange-500" />,
    iconBg: "bg-orange-500/10",
    title: "CSV Upload",
    description: "Import from spreadsheet",
  },
  {
    id: "single-contact",
    icon: <Plus size={20} className="text-emerald-600" />,
    iconBg: "bg-emerald-600/10",
    title: "Single Contact",
    description: "Add one contact manually",
  },
];

function IngestSourceSelect({ dispatch }: { dispatch: React.Dispatch<IngestAction> }) {
  const { data: sourceStatus } = useSourceStatus();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3">
      {SOURCE_CARDS.map((card) => {
        const isSyncing =
          (card.id === "linkedin" && sourceStatus?.linkedin.status === "syncing") ||
          (card.id === "gmail" && sourceStatus?.gmail.status === "syncing") ||
          (card.id === "firefly" && sourceStatus?.fireflies?.status === "syncing");
        const adminOnly = card.id === "linkedin" || card.id === "firefly";
        const disabled = card.comingSoon || isSyncing || (adminOnly && !isAdmin);

        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            onClick={() => dispatch({ type: "SELECT_SOURCE", source: card.id })}
            className="relative flex flex-col items-center gap-2 rounded-lg border border-border p-5 text-center transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className={`flex size-10 items-center justify-center rounded-lg ${card.iconBg}`}>
              {card.icon}
            </div>
            <div>
              <div className="text-sm font-medium">{card.title}</div>
              <div className="text-xs text-muted-foreground">{card.description}</div>
            </div>
            {card.comingSoon && (
              <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                Soon
              </Badge>
            )}
            {adminOnly && !isAdmin && (
              <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                Admin
              </Badge>
            )}
            {isSyncing && (
              <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] bg-blue-500/10 text-blue-600 border-0">
                Syncing
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Step 2: Source Configuration ──

function IngestSourceConfig({
  source,
  state,
  dispatch,
  onClose,
}: {
  source: IngestionSource;
  state: IngestState;
  dispatch: React.Dispatch<IngestAction>;
  onClose: () => void;
}) {
  switch (source) {
    case "linkedin":
      return <LinkedInConfig dispatch={dispatch} />;
    case "gmail":
      return <GmailConfig dispatch={dispatch} />;
    case "firefly":
      return <FireflyConfig dispatch={dispatch} />;
    case "csv":
      return <CsvConfig state={state} dispatch={dispatch} />;
    case "single-contact":
      return <SingleContactForm dispatch={dispatch} onClose={onClose} />;
    default:
      return null;
  }
}

const LINKEDIN_CHIPS = [
  { label: "1 pg", pages: 1 },
  { label: "5 pg", pages: 5 },
  { label: "10 pg", pages: 10 },
  { label: "25 pg", pages: 25 },
  { label: "All", pages: null },
] as const;

function LinkedInConfig({ dispatch }: { dispatch: React.Dispatch<IngestAction> }) {
  const [selectedPages, setSelectedPages] = useState<number | null>(null);
  const aimfoxBackfill = useAimfoxBackfill();
  const { data: sourceStatus } = useSourceStatus();
  const li = sourceStatus?.linkedin;
  const hasFetched = (li?.leadsSynced ?? 0) > 0;

  // Default to "All" for first time, "5 pg" for returning
  useEffect(() => {
    if (li) {
      setSelectedPages(hasFetched ? 5 : null);
    }
  }, [hasFetched, !!li]);

  function handleImport() {
    aimfoxBackfill.mutate({
      maxLeads: selectedPages != null ? selectedPages * 20 : undefined,
      syncConversations: true,
    });
    dispatch({ type: "START_INGESTION" });
  }

  return (
    <div className="space-y-4 py-2">
      {/* Fetched context */}
      {hasFetched && li && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{li.leadsSynced.toLocaleString()}</span> leads imported
            {" · "}{li.pagesFetched} pages
            {" · "}{li.contactsCreated.toLocaleString()} contacts
            {" · "}{li.companiesCreated.toLocaleString()} companies
          </div>
        </div>
      )}

      {/* Not connected warning */}
      {li && !li.connected && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5">
          <WarningCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">
            AIMFOX is not connected. Connect it in Settings &gt; Integrations first.
          </span>
        </div>
      )}

      {/* Page chips */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          {hasFetched ? "How many more to fetch?" : "How many leads to import?"}
        </label>
        <div className="mt-1.5 flex gap-1.5">
          {LINKEDIN_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setSelectedPages(chip.pages)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedPages === chip.pages
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Leads are imported alphabetically. Each page contains 20 leads.
        {hasFetched && " Resumes from where you left off."}
      </p>

      <Button
        className="w-full"
        disabled={aimfoxBackfill.isPending || !li?.connected}
        onClick={handleImport}
      >
        <ClockCounterClockwise size={14} />
        {selectedPages != null
          ? `Import ${selectedPages * 20} Leads`
          : "Import All Leads"
        }
      </Button>
    </div>
  );
}

/** Format an ISO date as "Jan 5, 2026" */
function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function monthsAgoDate(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

const RANGE_PRESETS = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
] as const;

function GmailConfig({ dispatch }: { dispatch: React.Dispatch<IngestAction> }) {
  const { data: sourceStatus } = useSourceStatus();
  const gmail = sourceStatus?.gmail;
  const hasFetched = !!gmail?.oldestEmailAt;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: monthsAgoDate(3),
    to: today,
  }));
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(range);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const gmailSync = useGmailSync();

  // Pre-fill with covered range when status loads
  useEffect(() => {
    if (gmail?.oldestEmailAt && gmail?.newestEmailAt) {
      const r = { from: new Date(gmail.oldestEmailAt), to: today };
      setRange(r);
      setDraftRange(r);
    }
  }, [gmail?.oldestEmailAt, gmail?.newestEmailAt]);

  const canSync = range?.from && range?.to && range.from < range.to;

  function handlePreset(months: number) {
    setDraftRange({ from: monthsAgoDate(months), to: today });
  }

  function handleCalendarConfirm() {
    setRange(draftRange);
    setCalendarOpen(false);
  }

  function handleCalendarCancel() {
    setDraftRange(range);
    setCalendarOpen(false);
  }

  function handleFetchLatest() {
    if (!gmail?.lastSyncAt) return;
    gmailSync.mutate({
      after: gmail.lastSyncAt,
      before: today.toISOString(),
    });
    dispatch({ type: "START_INGESTION" });
  }

  function handleSync() {
    if (!canSync) return;
    gmailSync.mutate({
      after: range.from!.toISOString(),
      before: range.to!.toISOString(),
    });
    dispatch({ type: "START_INGESTION" });
  }

  // Synced date range for disabling on calendar
  const syncedRange: DateRange | undefined =
    hasFetched && gmail?.oldestEmailAt && gmail?.newestEmailAt
      ? { from: new Date(gmail.oldestEmailAt), to: new Date(gmail.newestEmailAt) }
      : undefined;

  return (
    <div className="space-y-4 py-2">
      {/* Synced context */}
      {hasFetched && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{gmail!.emailsSynced.toLocaleString()}</span> emails synced
            {" · "}{fmtDate(gmail!.oldestEmailAt!)} — {fmtDate(gmail!.newestEmailAt!)}
          </div>
        </div>
      )}

      {/* Fetch latest — one-tap shortcut */}
      {hasFetched && gmail?.lastSyncAt && (
        <>
          <button
            type="button"
            onClick={handleFetchLatest}
            disabled={gmailSync.isPending}
            className="w-full flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <ClockCounterClockwise size={14} className="text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">Fetch latest</div>
              <div className="text-[11px] text-muted-foreground">
                Pick up new emails since {fmtDate(gmail.lastSyncAt)}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or pick a range</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {/* Custom range label */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          {hasFetched ? "Custom range" : "Time range"}
        </label>

        {/* Date range trigger → opens popover with presets + calendar */}
        <Popover open={calendarOpen} onOpenChange={(open) => {
          if (open) {
            setDraftRange(range);
          }
          setCalendarOpen(open);
        }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="mt-1.5 w-full flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
            >
              <CalendarBlank size={14} className="text-muted-foreground shrink-0" />
              <span className={range?.from ? "text-foreground" : "text-muted-foreground"}>
                {range?.from && range?.to
                  ? `${fmtDate(range.from)} — ${fmtDate(range.to)}`
                  : "Pick a date range"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            {/* Preset chips inside popover */}
            <div className="flex gap-1.5 border-b border-border px-3 py-2">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p.months)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={2}
              defaultMonth={draftRange?.from ? new Date(draftRange.from.getFullYear(), draftRange.from.getMonth()) : monthsAgoDate(1)}
              disabled={[{ after: new Date() }]}
              modifiers={syncedRange ? { synced: syncedRange } : undefined}
              modifiersClassNames={syncedRange ? { synced: "!bg-muted/60 !text-muted-foreground/50" } : undefined}
            />
            <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
              <Button variant="outline" size="sm" onClick={handleCalendarCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCalendarConfirm} disabled={!draftRange?.from || !draftRange?.to}>
                Confirm
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Emails already synced won't be duplicated.
      </p>

      <Button
        className="w-full"
        disabled={gmailSync.isPending || !canSync}
        onClick={handleSync}
      >
        <ClockCounterClockwise size={14} />
        Import Emails
      </Button>
    </div>
  );
}

function FireflyConfig({ dispatch }: { dispatch: React.Dispatch<IngestAction> }) {
  const { data: sourceStatus } = useSourceStatus({ fastPoll: true });
  const firefliesSync = useFirefliesSync();
  const cancelSync = useCancelFirefliesSync();

  const status = sourceStatus?.fireflies;
  const isSyncing = status?.status === "syncing";
  const hasSynced = !!status?.oldestTranscriptAt;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: monthsAgoDate(3),
    to: today,
  }));
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(range);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Pre-fill with covered range when status loads
  useEffect(() => {
    if (status?.oldestTranscriptAt && status?.newestTranscriptAt) {
      const r = { from: new Date(status.oldestTranscriptAt), to: today };
      setRange(r);
      setDraftRange(r);
    }
  }, [status?.oldestTranscriptAt, status?.newestTranscriptAt]);

  const canSync = range?.from && range?.to && range.from < range.to;

  function handlePreset(months: number) {
    setDraftRange({ from: monthsAgoDate(months), to: today });
  }

  function handleCalendarConfirm() {
    setRange(draftRange);
    setCalendarOpen(false);
  }

  function handleCalendarCancel() {
    setDraftRange(range);
    setCalendarOpen(false);
  }

  function handleFetchLatest() {
    if (!status?.lastSyncAt) return;
    firefliesSync.mutate({
      after: status.lastSyncAt,
      before: today.toISOString(),
    });
    dispatch({ type: "START_INGESTION" });
  }

  function handleSync() {
    if (!canSync) return;
    firefliesSync.mutate({
      after: range.from!.toISOString(),
      before: range.to!.toISOString(),
    });
    dispatch({ type: "START_INGESTION" });
  }

  const syncedRange: DateRange | undefined =
    hasSynced && status?.oldestTranscriptAt && status?.newestTranscriptAt
      ? { from: new Date(status.oldestTranscriptAt), to: new Date(status.newestTranscriptAt) }
      : undefined;

  if (!status?.connected) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-lg bg-purple-500/10">
          <Headset size={24} className="text-purple-500" />
        </div>
        <div>
          <p className="text-sm font-medium">Not Configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set the <code className="rounded bg-muted px-1 py-0.5 text-[11px]">FIREFLIES_API_KEY</code> environment variable to enable Fireflies integration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Synced context */}
      {hasSynced && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{status.transcriptsSynced.toLocaleString()}</span> transcripts synced
            {" · "}{fmtDate(status.oldestTranscriptAt!)} — {fmtDate(status.newestTranscriptAt!)}
          </div>
        </div>
      )}

      {/* Fetch latest — one-tap shortcut */}
      {hasSynced && status?.lastSyncAt && (
        <>
          <button
            type="button"
            onClick={handleFetchLatest}
            disabled={firefliesSync.isPending || isSyncing}
            className="w-full flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <ClockCounterClockwise size={14} className="text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">Fetch latest</div>
              <div className="text-[11px] text-muted-foreground">
                Pick up new transcripts since {fmtDate(status.lastSyncAt)}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or pick a range</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {/* Custom range */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          {hasSynced ? "Custom range" : "Time range"}
        </label>

        <Popover open={calendarOpen} onOpenChange={(open) => {
          if (open) setDraftRange(range);
          setCalendarOpen(open);
        }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="mt-1.5 w-full flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
            >
              <CalendarBlank size={14} className="text-muted-foreground shrink-0" />
              <span className={range?.from ? "text-foreground" : "text-muted-foreground"}>
                {range?.from && range?.to
                  ? `${fmtDate(range.from)} — ${fmtDate(range.to)}`
                  : "Pick a date range"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex gap-1.5 border-b border-border px-3 py-2">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p.months)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={2}
              defaultMonth={draftRange?.from ? new Date(draftRange.from.getFullYear(), draftRange.from.getMonth()) : monthsAgoDate(1)}
              disabled={[{ after: new Date() }]}
              modifiers={syncedRange ? { synced: syncedRange } : undefined}
              modifiersClassNames={syncedRange ? { synced: "!bg-muted/60 !text-muted-foreground/50" } : undefined}
            />
            <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
              <Button variant="outline" size="sm" onClick={handleCalendarCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCalendarConfirm} disabled={!draftRange?.from || !draftRange?.to}>
                Confirm
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {status.errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3">
          <p className="text-xs text-red-600 dark:text-red-400">{status.errorMessage}</p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Transcripts are matched to existing contacts by attendee email. Already-synced transcripts won't be duplicated.
      </p>

      {isSyncing ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => cancelSync.mutate()}
          disabled={cancelSync.isPending}
        >
          <SpinnerGap size={14} className="animate-spin" />
          Cancel Sync
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={firefliesSync.isPending || !canSync}
          onClick={handleSync}
        >
          <ClockCounterClockwise size={14} />
          Import Transcripts
        </Button>
      )}
    </div>
  );
}

function CsvConfig({
  state,
  dispatch,
}: {
  state: IngestState;
  dispatch: React.Dispatch<IngestAction>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadCsv();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setImportResult(null);
  }

  function handleImport() {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    uploadMutation.mutate(formData, {
      onSuccess: (data) => {
        setImportResult(data.result);
      },
    });
  }

  function handleCopySchema() {
    navigator.clipboard.writeText(SCHEMA_MARKDOWN).then(() => {
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2000);
    });
  }

  function handleContinue() {
    dispatch({ type: "INGESTION_COMPLETE", csvResult: importResult ?? undefined });
  }

  return (
    <div className="space-y-4 py-2">
      {/* Schema toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSchema(!showSchema)}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showSchema ? "Hide schema" : "View schema"}
        </button>
      </div>

      {showSchema && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium">CSV Schema</h3>
            <Button variant="outline" size="sm" onClick={handleCopySchema} className="h-6 text-[10px] px-2">
              {schemaCopied ? (
                <>
                  <Check size={12} className="mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={12} className="mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1 pr-3 text-left font-medium text-muted-foreground">Column</th>
                  <th className="py-1 pr-3 text-left font-medium text-muted-foreground">Required</th>
                  <th className="py-1 text-left font-medium text-muted-foreground">Example</th>
                </tr>
              </thead>
              <tbody>
                {CSV_SCHEMA.map((col) => (
                  <tr key={col.column} className="border-b border-border/50">
                    <td className="py-1 pr-3 font-mono">{col.column}</td>
                    <td className="py-1 pr-3">
                      {col.required ? (
                        <span className="text-primary">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="py-1 text-muted-foreground">{col.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            At least one of name or email required. Companies auto-created from email domains.
          </p>
        </div>
      )}

      {/* File upload */}
      <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

      {!importResult && (
        <>
          <div
            className="rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {!file ? (
              <>
                <UploadSimple size={24} className="mx-auto text-muted-foreground" />
                <p className="mt-2 text-xs font-medium">Drop a CSV file here or click to browse</p>
              </>
            ) : (
              <>
                <FileText size={24} className="mx-auto text-muted-foreground" />
                <p className="mt-2 text-xs font-medium">{file.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
              </>
            )}
          </div>

          {file && (
            <Button className="w-full" onClick={handleImport} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? (
                <>
                  <SpinnerGap size={14} className="animate-spin" />
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </Button>
          )}
        </>
      )}

      {/* Import result */}
      {importResult && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium">Import Complete</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5">
              <div>
                <p className="text-base font-semibold">{importResult.contactsCreated}</p>
                <p className="text-[10px] text-muted-foreground">Created</p>
              </div>
              <div>
                <p className="text-base font-semibold">{importResult.contactsUpdated}</p>
                <p className="text-[10px] text-muted-foreground">Updated</p>
              </div>
              <div>
                <p className="text-base font-semibold">{importResult.contactsSkipped}</p>
                <p className="text-[10px] text-muted-foreground">Skipped</p>
              </div>
              <div>
                <p className="text-base font-semibold">{importResult.companiesCreated}</p>
                <p className="text-[10px] text-muted-foreground">Companies</p>
              </div>
              <div>
                <p className="text-base font-semibold">{importResult.activitiesCreated}</p>
                <p className="text-[10px] text-muted-foreground">Activities</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {importResult.errors.map((error, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                    <WarningCircle size={12} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5">
          <WarningCircle size={14} className="text-destructive mt-0.5 shrink-0" />
          <span className="text-xs text-destructive">{state.error}</span>
        </div>
      )}
    </div>
  );
}

function SingleContactForm({
  dispatch,
  onClose,
}: {
  dispatch: React.Dispatch<IngestAction>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactSource, setContactSource] = useState("");
  const [contactPipeline, setContactPipeline] = useState<ContactPipeline | null>(null);

  const { data: companiesData } = useCompanies({ limit: 500 });
  const companies = companiesData?.companies ?? [];
  const createMutation = useCreateContact();
  const canSubmit = name.trim() && contactSource;

  function handleCreate() {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        name: name.trim(),
        source: contactSource as ContactSource,
        ...(contactPipeline && { category: contactPipeline }),
        ...(email && { email }),
        ...(phone && { phone }),
        ...(title && { title }),
        ...(linkedinUrl && { linkedinUrl }),
        ...(companyId && { companyId }),
      },
      {
        onSuccess: () => {
          dispatch({ type: "INGESTION_COMPLETE" });
        },
      },
    );
  }

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="ic-name">Name *</Label>
        <Input id="ic-name" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ic-email">Email</Label>
        <Input id="ic-email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ic-phone">Phone</Label>
        <Input id="ic-phone" placeholder="+1 (555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ic-title">Title</Label>
        <Input id="ic-title" placeholder="VP of Engineering" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ic-linkedin">LinkedIn URL</Label>
        <Input id="ic-linkedin" placeholder="https://linkedin.com/in/janedoe" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
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

      <Button disabled={!canSubmit || createMutation.isPending} onClick={handleCreate} className="w-full">
        {createMutation.isPending ? (
          <>
            <SpinnerGap size={16} className="animate-spin" />
            Adding...
          </>
        ) : (
          "Add Contact"
        )}
      </Button>
    </div>
  );
}

// ── Step 3: Ingestion Progress ──

function IngestProgress({
  source,
  dispatch,
}: {
  source: IngestionSource;
  dispatch: React.Dispatch<IngestAction>;
}) {
  const { data: sourceStatus } = useSourceStatus({ fastPoll: true });
  const cancelGmail = useCancelGmailSync();
  const cancelAimfox = useCancelAimfoxBackfill();
  const cancelFireflies = useCancelFirefliesSync();
  // Track whether we've observed "syncing" at least once — prevents premature
  // transition when the first poll returns "idle" before the server has started.
  const hasSeenSyncing = useRef(false);
  const mountedAt = useRef(Date.now());

  const isLinkedin = source === "linkedin";
  const isGmail = source === "gmail";
  const isFireflies = source === "firefly";

  const status = isLinkedin
    ? sourceStatus?.linkedin.status
    : isGmail
      ? sourceStatus?.gmail.status
      : isFireflies
        ? sourceStatus?.fireflies?.status
        : null;

  const isSyncing = status === "syncing";
  const isError = status === "error";

  // Record that we've observed the syncing state
  useEffect(() => {
    if (isSyncing) {
      hasSeenSyncing.current = true;
    }
  }, [isSyncing]);

  // Auto-transition when done — only after we've confirmed the sync started.
  // Two paths: (1) we saw "syncing" then it stopped, or (2) enough time passed
  // that a fast sync could have completed before we polled.
  useEffect(() => {
    if (!sourceStatus || isError || isSyncing) return;
    if (status === undefined) return;

    const elapsed = Date.now() - mountedAt.current;
    if (hasSeenSyncing.current || elapsed > 5000) {
      dispatch({ type: "INGESTION_COMPLETE" });
    }
  }, [isSyncing, isError, status, sourceStatus, dispatch]);

  const errorMessage = isLinkedin
    ? sourceStatus?.linkedin.errorMessage
    : isGmail
      ? sourceStatus?.gmail.errorMessage
      : isFireflies
        ? sourceStatus?.fireflies?.errorMessage
        : null;

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {isSyncing && (
        <>
          <SpinnerGap size={32} className="animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium">
              {isLinkedin ? "Importing LinkedIn leads..." : isFireflies ? "Syncing Fireflies transcripts..." : "Syncing Gmail emails..."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">This may take a few minutes.</p>
          </div>

          {/* Stats */}
          {isLinkedin && sourceStatus?.linkedin && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{sourceStatus.linkedin.leadsSynced.toLocaleString()} leads</span>
              <span>{sourceStatus.linkedin.contactsCreated.toLocaleString()} contacts</span>
              <span>{sourceStatus.linkedin.companiesCreated.toLocaleString()} companies</span>
            </div>
          )}
          {isGmail && sourceStatus?.gmail && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{sourceStatus.gmail.emailsSynced.toLocaleString()} emails</span>
              <span>{sourceStatus.gmail.contactsCreated.toLocaleString()} contacts</span>
              <span>{sourceStatus.gmail.companiesCreated.toLocaleString()} companies</span>
            </div>
          )}
          {isFireflies && sourceStatus?.fireflies && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{sourceStatus.fireflies.transcriptsSynced.toLocaleString()} transcripts</span>
              <span>{sourceStatus.fireflies.meetingsCreated.toLocaleString()} meetings</span>
              <span>{sourceStatus.fireflies.contactsMatched.toLocaleString()} contacts</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (isLinkedin) cancelAimfox.mutate();
              if (isGmail) cancelGmail.mutate();
              if (isFireflies) cancelFireflies.mutate();
            }}
            disabled={cancelAimfox.isPending || cancelGmail.isPending || cancelFireflies.isPending}
          >
            Cancel
          </Button>
        </>
      )}

      {isError && (
        <>
          <WarningCircle size={32} className="text-destructive" />
          <div className="text-center">
            <p className="text-sm font-medium text-destructive">Import failed</p>
            {errorMessage && (
              <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: "GO_BACK" })}>
            Try Again
          </Button>
        </>
      )}
    </div>
  );
}

// ── Step 4: Dedup Review ──

function DedupContactCard({ contact, label }: { contact: DedupCandidateContact; label: string }) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold">{contact.name}</div>
      {contact.title && <div className="text-xs text-muted-foreground">{contact.title}</div>}
      {contact.companyName && <div className="text-xs text-muted-foreground">{contact.companyName}</div>}
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
        <Badge variant="outline" className="text-[10px]">{contact.source}</Badge>
      </div>
      {contact.aiSummary && (
        <p className="text-xs text-muted-foreground italic pt-1">{contact.aiSummary}</p>
      )}
    </div>
  );
}

function IngestDedupReview({
  csvResult,
  dispatch,
}: {
  csvResult: ImportResult | null;
  dispatch: React.Dispatch<IngestAction>;
}) {
  const { data, isLoading } = usePendingDedupCandidates();
  const mergeMutation = useMergeContacts();
  const dismissMutation = useDismissCandidate();
  const candidates = data?.candidates ?? [];

  return (
    <div className="space-y-4 py-2">
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Checking for duplicates...</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          <div>
            <p className="text-sm font-medium">No duplicates detected</p>
            <p className="mt-1 text-xs text-muted-foreground">All clear — your contacts look good.</p>
          </div>
          <Button onClick={() => dispatch({ type: "FINISH_DEDUP" })}>
            Continue
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {candidates.length} potential duplicate{candidates.length !== 1 ? "s" : ""} found. Review each pair below.
          </p>

          <div className="space-y-3">
            {candidates.map((candidate) => (
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
                </div>

                <div className="flex gap-3">
                  <DedupContactCard contact={candidate.contactA} label="Contact A" />
                  <DedupContactCard contact={candidate.contactB} label="Contact B" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dismissMutation.mutate(candidate.id)}
                    disabled={dismissMutation.isPending || mergeMutation.isPending}
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
                    disabled={mergeMutation.isPending || dismissMutation.isPending}
                  >
                    <ArrowsMerge size={14} className="mr-1.5" />
                    Merge
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button className="w-full" onClick={() => dispatch({ type: "FINISH_DEDUP" })}>
            Continue
          </Button>
        </>
      )}
    </div>
  );
}

// ── Step 5: Classification Prompt ──

function IngestClassifyPrompt({ onClose }: { onClose: () => void }) {
  const [isStarting, setIsStarting] = useState(false);

  async function handleClassify() {
    setIsStarting(true);
    try {
      await api.classify.contacts();
      toast.success("AI classification started — running in background.");
    } catch {
      toast.error("Failed to start classification.");
    }
    onClose();
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-amber-500/10">
        <Sparkle size={24} className="text-amber-500" weight="fill" />
      </div>
      <div>
        <p className="text-sm font-medium">Run AI Classification?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Classify newly imported contacts into pipeline stages using AI analysis of emails and messages.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onClose}>
          Skip
        </Button>
        <Button onClick={handleClassify} disabled={isStarting}>
          {isStarting ? (
            <>
              <SpinnerGap size={14} className="animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Sparkle size={14} />
              Yes, Classify
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
