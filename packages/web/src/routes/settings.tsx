import {
  Calendar,
  EnvelopeSimple,
  GearSix,
  Headset,
  LinkedinLogo,
  Plus,
  X,
} from "@phosphor-icons/react";
import { createRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAimfoxAccounts,
  useSourceStatus,
  useUpdateCalendarSyncFrequency,
  useUpdateFirefliesSyncFrequency,
  useUpdateGmailSyncFrequency,
} from "@/hooks/use-integrations";
import {
  useInternalDomains,
  useUpdateInternalDomains,
} from "@/hooks/use-settings";
import { dashboardRoute } from "./dashboard";

export const settingsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/settings",
  component: SettingsPage,
});

const FREQUENCY_LABELS: Record<string, string> = {
  "15min": "Every 15 min",
  hourly: "Hourly",
  daily: "Daily",
  manual: "Manual only",
};

// ── Page ──

function SettingsPage() {
  const { data: domainsData, isLoading: domainsLoading } = useInternalDomains();
  const updateDomainsMutation = useUpdateInternalDomains();
  const [newDomain, setNewDomain] = useState("");

  const { data: sourceStatus, isLoading: statusLoading } = useSourceStatus();
  const updateGmailFrequency = useUpdateGmailSyncFrequency();
  const updateCalendarFrequency = useUpdateCalendarSyncFrequency();
  const updateFirefliesFrequency = useUpdateFirefliesSyncFrequency();

  const { data: aimfoxAccountsData, isLoading: accountsLoading } = useAimfoxAccounts();

  const domains = domainsData?.domains ?? [];
  const aimfoxAccounts = aimfoxAccountsData?.accounts ?? [];

  function handleAdd() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (domains.includes(domain)) {
      setNewDomain("");
      return;
    }
    updateDomainsMutation.mutate([...domains, domain]);
    setNewDomain("");
  }

  function handleRemove(domain: string) {
    updateDomainsMutation.mutate(domains.filter((d) => d !== domain));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="Settings" />

      <div className="mt-8 space-y-8">
        {/* ── Sync Schedule ── */}
        <section>
          <h2 className="text-sm font-semibold mb-4">Sync Schedule</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {/* Gmail frequency */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-red-500/10">
                  <EnvelopeSimple size={16} className="text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Gmail</p>
                  {statusLoading ? (
                    <Skeleton className="mt-0.5 h-3 w-24" />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {sourceStatus?.gmail.connected ? "Connected" : "Not connected"}
                    </p>
                  )}
                </div>
              </div>
              {statusLoading ? (
                <Skeleton className="h-8 w-[140px]" />
              ) : (
                <Select
                  value={sourceStatus?.gmail.syncFrequency ?? "manual"}
                  onValueChange={(value) => updateGmailFrequency.mutate(value)}
                >
                  <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Calendar frequency */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-green-500/10">
                  <Calendar size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Google Calendar</p>
                  {statusLoading ? (
                    <Skeleton className="mt-0.5 h-3 w-24" />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {sourceStatus?.google_calendar.connected ? "Connected" : "Not connected"}
                    </p>
                  )}
                </div>
              </div>
              {statusLoading ? (
                <Skeleton className="h-8 w-[140px]" />
              ) : (
                <Select
                  value={sourceStatus?.google_calendar.syncFrequency ?? "manual"}
                  onValueChange={(value) => updateCalendarFrequency.mutate(value)}
                >
                  <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Fireflies frequency */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-purple-500/10">
                  <Headset size={16} className="text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Fireflies</p>
                  {statusLoading ? (
                    <Skeleton className="mt-0.5 h-3 w-24" />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {sourceStatus?.fireflies?.connected ? "Connected" : "Not connected"}
                    </p>
                  )}
                </div>
              </div>
              {statusLoading ? (
                <Skeleton className="h-8 w-[140px]" />
              ) : (
                <Select
                  value={sourceStatus?.fireflies?.syncFrequency ?? "manual"}
                  onValueChange={(value) => updateFirefliesFrequency.mutate(value)}
                >
                  <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </section>

        {/* ── LinkedIn Accounts ── */}
        <section>
          <h2 className="text-sm font-semibold mb-4">LinkedIn Accounts</h2>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-blue-600/10">
                <LinkedinLogo size={18} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">AIMFOX</h3>
                  <Badge variant="secondary" className="text-[11px]">
                    Read-only
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  LinkedIn accounts connected through AIMFOX. Leads from all accounts are imported into the CRM.
                </p>
              </div>
            </div>

            <div className="mt-4">
              {accountsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : aimfoxAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No LinkedIn accounts found. Make sure AIMFOX is configured.
                </p>
              ) : (
                <div className="space-y-2">
                  {aimfoxAccounts.map((account) => (
                    <div key={account.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                      {account.picture_url ? (
                        <img
                          src={account.picture_url}
                          alt={account.full_name}
                          className="size-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-blue-600/10 text-xs font-medium text-blue-600">
                          {account.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{account.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          linkedin.com/in/{account.public_identifier}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.disabled ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Disabled
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-600 border-0">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Email Classification ── */}
        <section>
          <h2 className="text-sm font-semibold mb-4">Email Classification</h2>

          <div className="space-y-4">
            {/* Internal Domains */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
                  <GearSix size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold">Internal Company Domains</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Emails where all participants are from these domains will be skipped during Gmail sync. Add your
                    company's email domains (e.g. anthropic.com).
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {domainsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-8 w-36" />
                  </div>
                ) : (
                  <>
                    {domains.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {domains.map((domain) => (
                          <Badge key={domain} variant="secondary" className="gap-1 pl-2.5 pr-1 py-1 text-sm">
                            {domain}
                            <button
                              type="button"
                              onClick={() => handleRemove(domain)}
                              className="ml-1 rounded-sm p-0.5 hover:bg-muted-foreground/20 transition-colors"
                              disabled={updateDomainsMutation.isPending}
                            >
                              <X size={12} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. anthropic.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="max-w-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAdd}
                        disabled={!newDomain.trim() || updateDomainsMutation.isPending}
                      >
                        <Plus size={14} />
                        Add
                      </Button>
                    </div>

                    {domains.length === 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        No internal domains configured. All external emails will be synced.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
