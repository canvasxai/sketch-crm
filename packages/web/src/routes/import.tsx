import {
  ArrowsClockwise,
  Calendar,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  EnvelopeSimple,
  FileText,
  Headset,
  LinkedinLogo,
  SpinnerGap,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { createRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUploadCsv } from "@/hooks/use-ingestion";
import { useAimfoxBackfill, useGmailSync, useSourceStatus } from "@/hooks/use-integrations";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

export const importRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/import",
  component: ImportsPage,
});

// ── Helpers ──

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PERIOD_OPTIONS = [
  { value: "1month", label: "1 month" },
  { value: "3months", label: "3 months" },
  { value: "6months", label: "6 months" },
  { value: "1year", label: "1 year" },
  { value: "all", label: "All time" },
] as const;

const LINKEDIN_PAGE_OPTIONS = [
  { value: "1", label: "1 page (20 leads)" },
  { value: "5", label: "5 pages (100 leads)" },
  { value: "10", label: "10 pages (200 leads)" },
  { value: "all", label: "All leads" },
] as const;

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

// ── Page ──

function ImportsPage() {
  const { data: sourceStatus, isLoading: statusLoading } = useSourceStatus();
  const gmailSync = useGmailSync();
  const aimfoxBackfill = useAimfoxBackfill();

  const [gmailPeriod, setGmailPeriod] = useState("3months");
  const [calendarPeriod, setCalendarPeriod] = useState("3months");
  const [linkedinPages, setLinkedinPages] = useState("all");
  const [linkedinSyncConversations, setLinkedinSyncConversations] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="Imports" description="Import data from external sources and upload files." />

      <div className="mt-8 space-y-8">
        {/* ── Import Data ── */}
        <section>
          <h2 className="text-sm font-semibold mb-4">Import Data</h2>
          <div className="space-y-3">
            {/* CSV Upload */}
            <CsvUploadCard />

            {/* Gmail Backfill */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-red-500/10">
                  <EnvelopeSimple size={18} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Gmail</h3>
                    <span className="text-xs text-muted-foreground">Import historical emails</span>
                  </div>

                  {statusLoading ? (
                    <Skeleton className="mt-3 h-8 w-64" />
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <Select value={gmailPeriod} onValueChange={setGmailPeriod}>
                          <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PERIOD_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => gmailSync.mutate(gmailPeriod)}
                          disabled={gmailSync.isPending || sourceStatus?.gmail.status === "syncing"}
                        >
                          {sourceStatus?.gmail.status === "syncing" || gmailSync.isPending ? (
                            <>
                              <ArrowsClockwise size={14} className="animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <ClockCounterClockwise size={14} />
                              Start Import
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Stats */}
                      {(sourceStatus?.gmail.emailsSynced ?? 0) > 0 && (
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>{sourceStatus!.gmail.emailsSynced.toLocaleString()} emails synced</span>
                          <span>{sourceStatus!.gmail.contactsCreated.toLocaleString()} contacts created</span>
                          <span>{sourceStatus!.gmail.companiesCreated.toLocaleString()} companies created</span>
                        </div>
                      )}

                      {/* Error */}
                      {sourceStatus?.gmail.status === "error" && sourceStatus.gmail.errorMessage && (
                        <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-2.5">
                          <WarningCircle size={14} className="text-destructive mt-0.5 shrink-0" />
                          <span className="text-xs text-destructive">{sourceStatus.gmail.errorMessage}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Calendar Backfill */}
            <div className="rounded-lg border border-border bg-card p-5 opacity-60">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-green-500/10">
                  <Calendar size={18} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Google Calendar</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      Coming soon
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <Select value={calendarPeriod} onValueChange={setCalendarPeriod} disabled>
                      <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERIOD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
                      <ClockCounterClockwise size={14} />
                      Start Import
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* LinkedIn / AIMFOX Backfill */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-blue-600/10">
                  <LinkedinLogo size={18} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">LinkedIn</h3>
                    <span className="text-xs text-muted-foreground">Import AIMFOX leads</span>
                  </div>

                  {statusLoading ? (
                    <Skeleton className="mt-3 h-8 w-64" />
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <Select value={linkedinPages} onValueChange={setLinkedinPages}>
                          <SelectTrigger size="sm" className="h-8 w-[170px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LINKEDIN_PAGE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={linkedinSyncConversations}
                            onChange={(e) => setLinkedinSyncConversations(e.target.checked)}
                            className="size-3.5 rounded border-border accent-primary"
                          />
                          Include conversations
                        </label>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() =>
                            aimfoxBackfill.mutate({
                              maxLeads: linkedinPages === "all" ? undefined : Number(linkedinPages) * 20,
                              syncConversations: linkedinSyncConversations || undefined,
                            })
                          }
                          disabled={
                            aimfoxBackfill.isPending ||
                            sourceStatus?.linkedin.status === "syncing" ||
                            !sourceStatus?.linkedin.connected
                          }
                        >
                          {sourceStatus?.linkedin.status === "syncing" || aimfoxBackfill.isPending ? (
                            <>
                              <ArrowsClockwise size={14} className="animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <ClockCounterClockwise size={14} />
                              Start Import
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Stats */}
                      {(sourceStatus?.linkedin.leadsSynced ?? 0) > 0 && (
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>{sourceStatus!.linkedin.leadsSynced.toLocaleString()} leads synced</span>
                          <span>{sourceStatus!.linkedin.contactsCreated.toLocaleString()} contacts created</span>
                          <span>{sourceStatus!.linkedin.companiesCreated.toLocaleString()} companies created</span>
                        </div>
                      )}

                      {/* Error */}
                      {sourceStatus?.linkedin.status === "error" && sourceStatus.linkedin.errorMessage && (
                        <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-2.5">
                          <WarningCircle size={14} className="text-destructive mt-0.5 shrink-0" />
                          <span className="text-xs text-destructive">{sourceStatus.linkedin.errorMessage}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Fireflies Placeholder */}
            <div className="rounded-lg border border-border bg-card p-5 opacity-60">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-purple-500/10">
                  <Headset size={18} className="text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Fireflies</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      Coming soon
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Import meeting transcripts and notes from Fireflies.
                  </p>
                  <div className="mt-3">
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
                      <ClockCounterClockwise size={14} />
                      Start Import
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Recent Activity ── */}
        <section>
          <h2 className="text-sm font-semibold mb-4">Recent Activity</h2>

          {statusLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <SyncTimeline sourceStatus={sourceStatus} />
          )}
        </section>
      </div>
    </div>
  );
}

// ── CSV Upload Card ──

function CsvUploadCard() {
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

  function handleReset() {
    setFile(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-orange-500/10">
          <UploadSimple size={18} className="text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">CSV Upload</h3>
            <button
              type="button"
              onClick={() => setShowSchema(!showSchema)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSchema ? "Hide schema" : "View schema"}
            </button>
          </div>

          {/* Schema table (collapsible) */}
          {showSchema && (
            <div className="mt-3 rounded-lg border border-border p-3">
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

          <div
            className="mt-3 rounded-lg border-2 border-dashed border-border p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {!file ? (
              <>
                <UploadSimple size={20} className="mx-auto text-muted-foreground" />
                <p className="mt-1 text-xs font-medium">Drop a CSV file here or click to browse</p>
              </>
            ) : (
              <>
                <FileText size={20} className="mx-auto text-muted-foreground" />
                <p className="mt-1 text-xs font-medium">{file.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
              </>
            )}
          </div>

          {/* Actions */}
          {file && !importResult && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={handleImport} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? (
                  <>
                    <SpinnerGap size={14} className="animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import"
                )}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="mt-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium">Import Complete</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={handleReset}>
                  Import another
                </Button>
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
          )}
        </div>
      </div>
    </div>
  );
}

interface ImportResult {
  contactsCreated: number;
  contactsUpdated: number;
  contactsSkipped: number;
  companiesCreated: number;
  activitiesCreated: number;
  errors: string[];
}

// ── Sync Timeline ──

interface SourceStatusData {
  gmail: {
    connected: boolean;
    lastSyncAt: string | null;
    status: string;
    errorMessage: string | null;
    emailsSynced: number;
    contactsCreated: number;
    companiesCreated: number;
    syncFrequency: string;
    syncPeriod: string;
  };
  linkedin: {
    connected: boolean;
    lastLeadAt: string | null;
    status: string;
    lastSyncAt: string | null;
    errorMessage: string | null;
    leadsSynced: number;
    contactsCreated: number;
    companiesCreated: number;
  };
  canvas_signup: {
    connected: boolean;
    lastLeadAt: string | null;
  };
  google_calendar: {
    connected: boolean;
    lastSyncAt: string | null;
    lastLeadAt: string | null;
    status: string;
    errorMessage: string | null;
    eventsSynced: number;
    contactsCreated: number;
    meetingsCreated: number;
    syncFrequency: string;
    syncPeriod: string;
  };
}

function SyncTimeline({ sourceStatus }: { sourceStatus: SourceStatusData | undefined }) {
  if (!sourceStatus) return null;

  const entries: Array<{
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    time: string | null;
    status: string;
    stats: string;
    error?: string | null;
  }> = [];

  // Gmail
  if (sourceStatus.gmail.lastSyncAt || sourceStatus.gmail.status === "syncing") {
    entries.push({
      icon: <EnvelopeSimple size={14} className="text-red-500" />,
      iconBg: "bg-red-500/10",
      label: "Gmail sync",
      time: sourceStatus.gmail.lastSyncAt,
      status: sourceStatus.gmail.status,
      stats: `${sourceStatus.gmail.emailsSynced.toLocaleString()} emails, ${sourceStatus.gmail.contactsCreated.toLocaleString()} contacts`,
      error: sourceStatus.gmail.errorMessage,
    });
  }

  // Calendar
  if (sourceStatus.google_calendar.lastSyncAt || sourceStatus.google_calendar.status === "syncing") {
    entries.push({
      icon: <Calendar size={14} className="text-green-600" />,
      iconBg: "bg-green-500/10",
      label: "Calendar sync",
      time: sourceStatus.google_calendar.lastSyncAt,
      status: sourceStatus.google_calendar.status,
      stats: `${sourceStatus.google_calendar.eventsSynced.toLocaleString()} events, ${sourceStatus.google_calendar.meetingsCreated.toLocaleString()} meetings`,
      error: sourceStatus.google_calendar.errorMessage,
    });
  }

  // LinkedIn
  if (sourceStatus.linkedin.lastSyncAt || sourceStatus.linkedin.lastLeadAt || sourceStatus.linkedin.status === "syncing") {
    entries.push({
      icon: <LinkedinLogo size={14} className="text-blue-600" />,
      iconBg: "bg-blue-600/10",
      label: "LinkedIn sync",
      time: sourceStatus.linkedin.lastSyncAt ?? sourceStatus.linkedin.lastLeadAt,
      status: sourceStatus.linkedin.status,
      stats: `${sourceStatus.linkedin.leadsSynced.toLocaleString()} leads, ${sourceStatus.linkedin.contactsCreated.toLocaleString()} contacts`,
      error: sourceStatus.linkedin.errorMessage,
    });
  }

  // Sort by most recent first
  entries.sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No sync activity yet. Start an import above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className={cn("flex size-7 items-center justify-center rounded-md", entry.iconBg)}>
            {entry.status === "syncing" ? (
              <ArrowsClockwise size={14} className="animate-spin text-primary" />
            ) : (
              entry.icon
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{entry.label}</span>
              {entry.status === "syncing" && (
                <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 border-0">
                  Syncing
                </Badge>
              )}
              {entry.status === "error" && (
                <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border-0">
                  Error
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{entry.stats}</p>
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(entry.time)}</span>
        </div>
      ))}
    </div>
  );
}
