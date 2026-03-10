import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useDedupLog(contactId: string | undefined) {
  return useQuery({
    queryKey: ["dedup-log", contactId],
    queryFn: () => api.dedupLog.listByContact(contactId!),
    enabled: !!contactId,
  });
}

export function useUnreviewedDedupLogs() {
  return useQuery({
    queryKey: ["dedup-log", "unreviewed"],
    queryFn: () => api.dedupLog.listUnreviewed(),
  });
}

export function useReviewDedupLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (logId: string) => api.dedupLog.markReviewed(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dedup-log"] });
    },
  });
}
