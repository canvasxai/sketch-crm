import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useSourceStatus(opts?: { fastPoll?: boolean }) {
  return useQuery({
    queryKey: ["integrations", "source-status"],
    queryFn: () => api.integrations.sourceStatus(),
    refetchInterval: (query) => {
      // Fast-poll mode: always poll every 3s (used during ingestion progress)
      if (opts?.fastPoll) return 3000;

      const data = query.state.data;
      const anySyncing =
        data?.gmail.status === "syncing" ||
        data?.google_calendar.status === "syncing" ||
        data?.linkedin.status === "syncing" ||
        data?.fireflies?.status === "syncing";
      return anySyncing ? 5000 : 60_000;
    },
  });
}

export function useGmailStatus() {
  return useQuery({
    queryKey: ["integrations", "gmail", "status"],
    queryFn: () => api.integrations.gmailStatus(),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.syncState?.status === "syncing") return 5000;
      return false;
    },
  });
}

export function useGmailSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { syncPeriod: string } | { after: string; before: string }) =>
      api.integrations.gmailSync(params),
    onSuccess: (data) => {
      toast.success(
        `Synced ${data.result.emailsSynced} emails, ${data.result.contactsCreated} contacts created`,
      );
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateGmailSyncFrequency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frequency: string) =>
      api.integrations.updateGmailSyncFrequency({ frequency }),
    onSuccess: () => {
      toast.success("Sync frequency updated");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateGmailSyncPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (period: string) =>
      api.integrations.updateGmailSyncPeriod({ period }),
    onSuccess: () => {
      toast.success("Sync period updated");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateCalendarSyncPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (period: string) =>
      api.integrations.updateCalendarSyncPeriod({ period }),
    onSuccess: () => {
      toast.success("Sync period updated");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateCalendarSyncFrequency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frequency: string) =>
      api.integrations.updateCalendarSyncFrequency({ frequency }),
    onSuccess: () => {
      toast.success("Sync frequency updated");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCancelAimfoxBackfill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.integrations.cancelAimfoxBackfill(),
    onSuccess: () => {
      toast.success("LinkedIn import cancelled");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCancelGmailSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.integrations.cancelGmailSync(),
    onSuccess: () => {
      toast.success("Gmail import cancelled");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useFirefliesSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { after: string; before: string }) =>
      api.integrations.firefliesSync(params),
    onSuccess: () => {
      toast.success("Fireflies sync started");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCancelFirefliesSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.integrations.cancelFirefliesSync(),
    onSuccess: () => {
      toast.success("Fireflies sync cancelled");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useAimfoxAccounts() {
  return useQuery({
    queryKey: ["integrations", "aimfox", "accounts"],
    queryFn: () => api.integrations.aimfoxAccounts(),
    staleTime: 5 * 60_000,
  });
}

export function useAimfoxBackfill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts: { batchSize?: number; syncConversations?: boolean; maxLeads?: number } | void) =>
      api.integrations.aimfoxBackfill(opts || undefined),
    onSuccess: (data) => {
      toast.success(
        `LinkedIn import complete: ${data.result.contactsCreated} contacts, ${data.result.companiesCreated} companies`,
      );
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
