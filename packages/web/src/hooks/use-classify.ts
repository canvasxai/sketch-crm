import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * Polls a classification run's status and logs.
 * Refetches every 3 seconds while the run is still in progress.
 */
export function useClassificationRun(runId: string) {
  return useQuery({
    queryKey: ["classification-run", runId],
    queryFn: () => api.classify.run(runId),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === "running" ? 3000 : false;
    },
  });
}

/**
 * Cancels an in-progress classification run.
 */
export function useCancelClassification(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.classify.cancel(),
    onSuccess: () => {
      toast.info("Classification stopped");
      // Force an immediate refetch so the UI picks up the cancelled status
      queryClient.invalidateQueries({ queryKey: ["classification-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["needs-classification-count"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Returns the count of contacts needing classification (for badge).
 */
export function useNeedsClassificationCount() {
  return useQuery({
    queryKey: ["needs-classification-count"],
    queryFn: () => api.classify.needsClassificationCount(),
    select: (data) => data.count,
  });
}

/**
 * Returns list of all past classification runs (most recent first).
 */
export function useClassificationRuns() {
  return useQuery({
    queryKey: ["classification-runs"],
    queryFn: () => api.classify.runs(),
    select: (data) => data.runs,
  });
}

/**
 * Returns classification history for a specific contact.
 */
export function useClassificationHistory(contactId: string) {
  return useQuery({
    queryKey: ["classification-history", contactId],
    queryFn: () => api.classify.contactHistory(contactId),
    select: (data) => data.logs,
    enabled: !!contactId,
  });
}
