import type { CompanyCategory } from "@crm/shared";
import type { DrawerTimelineEvent, LeadChannel } from "./drawer-types";
import { CATEGORY_STYLES, CATEGORY_LABELS, leadChannelLabels, sourceLabels } from "./drawer-types";

// ── Time formatting ──

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Date grouping ──

export function groupByDate(
  events: DrawerTimelineEvent[],
): { label: string; events: DrawerTimelineEvent[] }[] {
  const groups = new Map<string, DrawerTimelineEvent[]>();

  for (const event of events) {
    const dateKey = new Date(event.date).toDateString();
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(dateKey, [event]);
    }
  }

  return Array.from(groups.entries()).map(([_dateKey, evts]) => ({
    label: formatRelativeDate(evts[0].date),
    events: evts,
  }));
}

// ── Label helpers ──

export function drawerCategoryStyle(category: CompanyCategory): string {
  return CATEGORY_STYLES[category] ?? "bg-secondary text-secondary-foreground";
}

export function drawerCategoryLabel(category: CompanyCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function drawerSourceLabel(source: string): string {
  return sourceLabels[source] ?? source;
}

export function drawerChannelLabel(channel: LeadChannel): string {
  return leadChannelLabels[channel] ?? channel;
}
