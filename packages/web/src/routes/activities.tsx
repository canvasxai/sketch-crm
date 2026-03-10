import { useMemo, useState } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Clock as ClockIcon,
  FunnelSimple,
} from "@phosphor-icons/react";
import { useGlobalTimeline } from "@/hooks/use-timeline";
import { mapTimelineEntry } from "@/lib/timeline-mapper";
import { timelineEventConfig } from "@/lib/drawer-event-config";
import { groupByDate, formatTime } from "@/lib/drawer-helpers";
import {
  TIMELINE_FILTERS,
  type TimelineFilter,
  filterToTypes,
  type DrawerTimelineEventType,
} from "@/lib/drawer-types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

export const activitiesRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/activities",
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useGlobalTimeline({ limit: 200 });

  // Map API entries → rich timeline events
  const allEvents = useMemo(
    () => (data?.timeline ?? []).map(mapTimelineEntry),
    [data],
  );

  // ── Filtering ──
  const [activeFilters, setActiveFilters] = useState<Set<TimelineFilter>>(new Set());

  function toggleFilter(filter: TimelineFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (filter === "all") return new Set();
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  const filteredEvents = useMemo(() => {
    if (activeFilters.size === 0) return allEvents;
    const allowedTypes = new Set<DrawerTimelineEventType>();
    for (const filter of activeFilters) {
      const types = filterToTypes[filter];
      if (types) for (const t of types) allowedTypes.add(t);
    }
    return allEvents.filter((e) => allowedTypes.has(e.type));
  }, [allEvents, activeFilters]);

  const grouped = useMemo(() => groupByDate(filteredEvents), [filteredEvents]);

  // ── Expand/collapse ──
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Activities"
          description="Timeline of all activity across your contacts."
        />

        {/* Filter button */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "mt-1 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted",
                activeFilters.size > 0
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              <FunnelSimple size={12} />
              {activeFilters.size > 0
                ? `Filtered (${activeFilters.size})`
                : "All activity"}
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
                      isActive
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
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

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<ClockIcon size={32} />}
            title={activeFilters.size > 0 ? "No matching activity" : "No activity yet"}
            description={
              activeFilters.size > 0
                ? "Try adjusting your filters."
                : "Activity will appear here as you interact with contacts."
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-0">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="mb-2 mt-5 first:mt-0">
                <span className="text-xs font-semibold text-muted-foreground">
                  {group.label}
                </span>
              </div>

              <div className="relative ml-4">
                <div className="absolute top-0 bottom-0 left-[11px] w-px bg-border" />

                {group.events.map((event) => {
                  const config = timelineEventConfig[event.type];
                  const Icon = config.icon;
                  const isExpanded = expanded.has(event.id);
                  const hasExpandableContent = !!event.description;
                  const isTask = event.type === "task";

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "relative flex w-full gap-3 pb-4 text-left last:pb-0",
                        hasExpandableContent &&
                          "cursor-pointer rounded-md transition-colors hover:bg-muted/40 -mx-1.5 px-1.5",
                      )}
                      onClick={() => {
                        if (hasExpandableContent) toggleExpanded(event.id);
                      }}
                    >
                      {/* Icon */}
                      {isTask ? (
                        <div
                          className={cn(
                            "relative z-10 flex size-6 shrink-0 items-center justify-center rounded",
                            event.completed
                              ? "bg-indigo-100 text-indigo-600"
                              : "border border-border text-muted-foreground",
                          )}
                        >
                          {event.completed && (
                            <Check size={13} weight="bold" />
                          )}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full",
                            config.color,
                          )}
                        >
                          <Icon size={13} />
                        </div>
                      )}

                      {/* Content */}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm text-foreground",
                              isTask &&
                                event.completed &&
                                "line-through text-muted-foreground",
                            )}
                          >
                            {event.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatTime(event.date)}
                          </span>
                        </div>

                        {/* Contact name */}
                        {event.contactName && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {event.contactName}
                          </p>
                        )}

                        {/* Task metadata */}
                        {isTask &&
                          (event.assignee || event.dueDate) && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {event.assignee && <span>{event.assignee}</span>}
                              {event.assignee && event.dueDate && (
                                <span> &middot; </span>
                              )}
                              {event.dueDate && (
                                <span>
                                  Due{" "}
                                  {new Date(event.dueDate).toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric" },
                                  )}
                                </span>
                              )}
                            </p>
                          )}

                        {/* Stage change */}
                        {event.type === "stage_change" &&
                          event.fromStage &&
                          event.toStage && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {event.fromStage} &rarr; {event.toStage}
                              {event.changedBy && (
                                <span> &middot; by {event.changedBy}</span>
                              )}
                            </p>
                          )}

                        {/* Expandable description */}
                        {event.description && (
                          <p
                            className={cn(
                              "mt-0.5 text-xs text-muted-foreground",
                              isExpanded
                                ? "whitespace-pre-wrap"
                                : "line-clamp-2",
                            )}
                          >
                            {event.description}
                          </p>
                        )}

                        {/* Direction badge */}
                        {event.direction && (
                          <Badge
                            variant="outline"
                            className="mt-1 text-[10px] px-1.5 py-0 font-normal"
                          >
                            {event.direction === "outbound"
                              ? "Outbound"
                              : "Inbound"}
                          </Badge>
                        )}

                        {/* Meeting details */}
                        {(event.type === "meeting" ||
                          event.type === "calendar_event") &&
                          (event.duration || event.location) && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {[event.duration, event.location]
                                .filter(Boolean)
                                .join(" \u00B7 ")}
                            </p>
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
  );
}
