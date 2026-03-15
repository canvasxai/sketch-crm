import { useEffect, useRef, useState } from "react";
import {
  Sparkle,
  SpinnerGap,
  Stop,
  CheckCircle,
  XCircle,
  WarningCircle,
  ClockCounterClockwise,
  ArrowLeft,
  Play,
  CaretRight,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PipelineBadge } from "@/components/funnel-stage-badge";
import {
  useClassificationRun,
  useClassificationRuns,
  useCancelClassification,
  useNeedsClassificationCount,
} from "@/hooks/use-classify";
import { api } from "@/lib/api";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CompanyPipeline, ClassificationLogEntry, ClassificationRun } from "@crm/shared";

// ── Helpers ──

function formatDuration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const confidenceColors: Record<string, string> = {
  high: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const statusConfig: Record<string, { label: string; className: string; icon?: typeof CheckCircle }> = {
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Stopped",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  running: {
    label: "Running",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: SpinnerGap,
  },
};

/** Seconds without progress before showing stale warning */
const STALE_THRESHOLD_S = 30;

type View = "landing" | "running" | "history" | "run-detail";

// ── ClassificationPopover ──

export function ClassificationPopover() {
  const queryClient = useQueryClient();
  const needsClassificationCount = useNeedsClassificationCount();

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [view, setView] = useState<View>("landing");
  const [detailRunId, setDetailRunId] = useState<string | null>(null);

  // On mount, check if there's already a running classification
  useEffect(() => {
    api.classify
      .latestRun()
      .then((data) => {
        if (data.run?.status === "running") {
          setActiveRunId(data.run.id);
          setView("running");
        }
      })
      .catch(() => {
        // ignore — user may not have any runs yet
      });
  }, []);

  // Start classification mutation
  const classifyMutation = useMutation({
    mutationFn: () => api.classify.contacts(),
    onSuccess: (data) => {
      if (!data.runId) {
        toast.info(data.message ?? "No contacts need classification");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["needs-classification-count"] });
      setActiveRunId(data.runId);
      setView("running");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Poll the active run
  const { data: runData } = useClassificationRun(activeRunId ?? "");
  const run = activeRunId ? runData?.run ?? null : null;
  const logs = activeRunId ? runData?.logs ?? [] : [];
  const isRunning = run?.status === "running";

  // Poll detail run (for viewing past run logs)
  const { data: detailData } = useClassificationRun(detailRunId ?? "");
  const detailRun = detailRunId ? detailData?.run ?? null : null;
  const detailLogs = detailRunId ? detailData?.logs ?? [] : [];

  // Cancel mutation
  const baseCancelMutation = useCancelClassification(activeRunId ?? "");
  const cancelMutation = useMutation({
    mutationFn: () => baseCancelMutation.mutateAsync(),
    onSuccess: () => {
      setActiveRunId(null);
      setView("landing");
    },
  });

  // ── Staleness detection ──
  const lastProcessedRef = useRef<number>(-1);
  const lastProgressTimeRef = useRef<number>(Date.now());
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (!run || !isRunning) {
      lastProcessedRef.current = -1;
      setIsStale(false);
      return;
    }
    if (run.processedContacts !== lastProcessedRef.current) {
      lastProcessedRef.current = run.processedContacts;
      lastProgressTimeRef.current = Date.now();
      setIsStale(false);
    }
  }, [run, isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - lastProgressTimeRef.current) / 1000;
      setIsStale(elapsed >= STALE_THRESHOLD_S);
    }, 5_000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // When run completes, invalidate queries and stay on running view (shows completed state)
  const prevIsRunning = useRef(isRunning);
  useEffect(() => {
    if (prevIsRunning.current && !isRunning && activeRunId && run) {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["needs-classification-count"] });
      queryClient.invalidateQueries({ queryKey: ["dedup-contact-ids"] });
      queryClient.invalidateQueries({ queryKey: ["classification-runs"] });
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, activeRunId, run, queryClient]);

  // Auto-switch to running view if a run becomes active
  useEffect(() => {
    if (isRunning && view !== "running") {
      setView("running");
    }
  }, [isRunning, view]);

  const progressPct =
    run && run.totalContacts > 0
      ? Math.round((run.processedContacts / run.totalContacts) * 100)
      : 0;

  const allContactsDone = run ? run.processedContacts >= run.totalContacts : false;
  const count = needsClassificationCount.data;

  // Derive button label
  let buttonLabel: string;
  if (isRunning) {
    if (allContactsDone) {
      buttonLabel = "Running dedup check...";
    } else if (isStale) {
      buttonLabel = `Classifying (${run!.processedContacts}/${run!.totalContacts}) — stalled`;
    } else {
      buttonLabel = `Classifying (${run!.processedContacts}/${run!.totalContacts})`;
    }
  } else if (classifyMutation.isPending) {
    buttonLabel = "Starting...";
  } else if (count) {
    buttonLabel = `AI Classify (${count})`;
  } else {
    buttonLabel = "AI Classify";
  }

  // When popover opens, decide the initial view
  function handleOpenChange(open: boolean) {
    setPopoverOpen(open);
    if (open && !isRunning && !activeRunId) {
      setView("landing");
      setDetailRunId(null);
    }
  }

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={classifyMutation.isPending}
        >
          {isRunning ? (
            <SpinnerGap size={16} className="animate-spin" />
          ) : (
            <Sparkle size={16} />
          )}
          {buttonLabel}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[420px] max-h-[480px] p-0 flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {view === "landing" && (
          <LandingView
            count={count ?? 0}
            isStarting={classifyMutation.isPending}
            onStart={() => classifyMutation.mutate()}
            onViewHistory={() => setView("history")}
          />
        )}

        {view === "running" && run && (
          <RunningView
            run={run}
            logs={logs}
            isRunning={isRunning}
            isStale={isStale}
            progressPct={progressPct}
            allContactsDone={allContactsDone}
            cancelPending={cancelMutation.isPending}
            onCancel={() => cancelMutation.mutate()}
            onDismiss={() => {
              setActiveRunId(null);
              setView("landing");
              setPopoverOpen(false);
            }}
            onViewHistory={() => setView("history")}
          />
        )}

        {view === "history" && (
          <HistoryView
            onBack={() => {
              if (activeRunId && run) {
                setView("running");
              } else {
                setView("landing");
              }
            }}
            onSelectRun={(runId) => {
              setDetailRunId(runId);
              setView("run-detail");
            }}
          />
        )}

        {view === "run-detail" && detailRun && (
          <RunDetailView
            run={detailRun}
            logs={detailLogs}
            onBack={() => {
              setDetailRunId(null);
              setView("history");
            }}
          />
        )}

        {/* Fallback for loading states */}
        {view === "run-detail" && !detailRun && detailRunId && (
          <div className="flex items-center justify-center py-12">
            <SpinnerGap size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {view === "running" && !run && (
          <div className="flex items-center justify-center py-12">
            <SpinnerGap size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Landing View ──

function LandingView({
  count,
  isStarting,
  onStart,
  onViewHistory,
}: {
  count: number;
  isStarting: boolean;
  onStart: () => void;
  onViewHistory: () => void;
}) {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Sparkle size={16} className="text-amber-500" weight="fill" />
        <span className="text-sm font-semibold">AI Classification</span>
      </div>

      {/* Content */}
      <div className="px-4 py-5 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-2xl font-semibold tabular-nums">{count}</p>
          <p className="text-xs text-muted-foreground">
            {count === 1 ? "contact needs" : "contacts need"} classification
          </p>
        </div>

        <Button
          className="w-full gap-2"
          onClick={onStart}
          disabled={isStarting || count === 0}
        >
          {isStarting ? (
            <SpinnerGap size={16} className="animate-spin" />
          ) : (
            <Play size={16} weight="fill" />
          )}
          {isStarting ? "Starting..." : "Start Classification"}
        </Button>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
          onClick={onViewHistory}
        >
          <ClockCounterClockwise size={14} />
          View past runs
          <CaretRight size={12} className="ml-auto" />
        </button>
      </div>
    </div>
  );
}

// ── Running View ──

function RunningView({
  run,
  logs,
  isRunning,
  isStale,
  progressPct,
  allContactsDone,
  cancelPending,
  onCancel,
  onDismiss,
  onViewHistory,
}: {
  run: ClassificationRun;
  logs: ClassificationLogEntry[];
  isRunning: boolean;
  isStale: boolean;
  progressPct: number;
  allContactsDone: boolean;
  cancelPending: boolean;
  onCancel: () => void;
  onDismiss: () => void;
  onViewHistory: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkle size={16} className="text-amber-500" weight="fill" />
          <span className="text-sm font-semibold">AI Classification</span>
          <RunStatusBadge status={run.status} isStale={isStale} />
        </div>
        {isRunning && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
            onClick={onCancel}
            disabled={cancelPending}
          >
            <Stop size={12} weight="fill" />
            Cancel
          </Button>
        )}
        {!isRunning && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>

      {/* Progress bar (while running) */}
      {isRunning && (
        <div className="px-4 py-2 border-b border-border space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            {allContactsDone ? (
              <span>All contacts classified — running dedup check...</span>
            ) : (
              <span>
                Classified {run.processedContacts} of {run.totalContacts} contacts
                {run.errors > 0 && <span className="text-red-500"> ({run.errors} errors)</span>}
              </span>
            )}
            {!allContactsDone && <span>{progressPct}%</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isStale ? "bg-amber-400" : "bg-amber-500"}`}
              style={{ width: allContactsDone ? "100%" : `${progressPct}%` }}
            />
          </div>
          {isStale && !allContactsDone && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              No progress for 30s+ — the AI call may be timing out. You can cancel and retry.
            </p>
          )}
        </div>
      )}

      {/* Summary stats (when done) */}
      {!isRunning && (
        <div className="flex gap-4 px-4 py-2 border-b border-border text-[11px]">
          <div>
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium">{run.processedContacts}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Changes: </span>
            <span className="font-medium">{run.categoryChanges}</span>
          </div>
          {run.errors > 0 && (
            <div>
              <span className="text-muted-foreground">Errors: </span>
              <span className="font-medium text-red-600">{run.errors}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Duration: </span>
            <span className="font-medium">{formatDuration(run.startedAt, run.completedAt)}</span>
          </div>
        </div>
      )}

      {/* Classification log */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {logs.map((log) => (
          <ClassificationLogCard key={log.id} log={log} />
        ))}
        {isRunning && logs.length === 0 && (
          <p className="text-xs text-muted-foreground py-6 text-center">Waiting for results...</p>
        )}
      </div>

      {/* Footer with link to history */}
      {!isRunning && (
        <div className="border-t border-border px-4 py-2">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
            onClick={onViewHistory}
          >
            <ClockCounterClockwise size={14} />
            View past runs
            <CaretRight size={12} className="ml-auto" />
          </button>
        </div>
      )}
    </>
  );
}

// ── History View ──

function HistoryView({
  onBack,
  onSelectRun,
}: {
  onBack: () => void;
  onSelectRun: (runId: string) => void;
}) {
  const runs = useClassificationRuns();

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          className="p-0.5 rounded hover:bg-muted transition-colors"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-semibold">Past Runs</span>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-y-auto">
        {runs.isLoading && (
          <div className="flex items-center justify-center py-12">
            <SpinnerGap size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {runs.data && runs.data.length === 0 && (
          <p className="text-xs text-muted-foreground py-8 text-center">No classification runs yet.</p>
        )}

        {runs.data?.map((r) => (
          <RunRow key={r.id} run={r} onClick={() => onSelectRun(r.id)} />
        ))}
      </div>
    </>
  );
}

// ── Run Detail View ──

function RunDetailView({
  run,
  logs,
  onBack,
}: {
  run: ClassificationRun;
  logs: ClassificationLogEntry[];
  onBack: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          className="p-0.5 rounded hover:bg-muted transition-colors"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-semibold">Run Details</span>
        <RunStatusBadge status={run.status} isStale={false} />
      </div>

      {/* Stats */}
      <div className="flex gap-4 px-4 py-2 border-b border-border text-[11px]">
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="font-medium">{run.processedContacts}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Changes: </span>
          <span className="font-medium">{run.categoryChanges}</span>
        </div>
        {run.errors > 0 && (
          <div>
            <span className="text-muted-foreground">Errors: </span>
            <span className="font-medium text-red-600">{run.errors}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Duration: </span>
          <span className="font-medium">{formatDuration(run.startedAt, run.completedAt)}</span>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {logs.length === 0 && (
          <p className="text-xs text-muted-foreground py-6 text-center">No classification logs for this run.</p>
        )}
        {logs.map((log) => (
          <ClassificationLogCard key={log.id} log={log} />
        ))}
      </div>
    </>
  );
}

// ── Shared sub-components ──

function RunStatusBadge({ status, isStale }: { status: string; isStale: boolean }) {
  if (status === "running" && isStale) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 font-medium border-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      >
        <WarningCircle size={10} weight="fill" className="mr-0.5" />
        Stalled
      </Badge>
    );
  }

  const config = statusConfig[status];
  if (!config) return null;

  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium border-0 ${config.className}`}>
      {Icon && (
        <Icon
          size={10}
          weight={status === "running" ? undefined : "fill"}
          className={`mr-0.5 ${status === "running" ? "animate-spin" : ""}`}
        />
      )}
      {config.label}
    </Badge>
  );
}

function RunRow({ run, onClick }: { run: ClassificationRun; onClick: () => void }) {
  const config = statusConfig[run.status];

  return (
    <button
      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-b-0"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {run.processedContacts} contacts
          </span>
          {config && (
            <Badge
              variant="secondary"
              className={`text-[9px] px-1 py-0 font-medium border-0 ${config.className}`}
            >
              {config.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{formatDate(run.startedAt)}</span>
          <span>{run.categoryChanges} changes</span>
          {run.errors > 0 && <span className="text-red-500">{run.errors} errors</span>}
          <span>{formatDuration(run.startedAt, run.completedAt)}</span>
        </div>
      </div>
      <CaretRight size={14} className="text-muted-foreground shrink-0" />
    </button>
  );
}

function ClassificationLogCard({ log }: { log: ClassificationLogEntry }) {
  const categoryChanged = log.categoryAssigned !== log.previousCategory;
  const confClass = confidenceColors[log.confidence ?? ""] ?? confidenceColors.low;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate">{log.contactName ?? "Unknown"}</span>
          {log.companyName && (
            <span className="text-[11px] text-muted-foreground truncate">· {log.companyName}</span>
          )}
        </div>
        {log.confidence && (
          <Badge
            variant="secondary"
            className={`text-[9px] px-1 py-0 font-medium border-0 shrink-0 ${confClass}`}
          >
            {log.confidence}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <PipelineBadge pipeline={(log.previousCategory ?? "uncategorized") as CompanyPipeline} />
        {categoryChanged ? (
          <>
            <span className="text-muted-foreground">→</span>
            <PipelineBadge pipeline={(log.categoryAssigned ?? "uncategorized") as CompanyPipeline} />
          </>
        ) : (
          <span className="text-muted-foreground italic">no change</span>
        )}
      </div>
      {log.aiSummary && (
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{log.aiSummary}</p>
      )}
    </div>
  );
}
