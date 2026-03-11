import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function usePendingDedupCandidates() {
  return useQuery({
    queryKey: ["dedup-candidates", "pending"],
    queryFn: () => api.dedupCandidates.listPending(),
  });
}

export function useDedupCandidateCount() {
  return useQuery({
    queryKey: ["dedup-candidates", "count"],
    queryFn: () => api.dedupCandidates.countPending(),
    refetchInterval: 60_000,
  });
}

export function useDedupContactIds() {
  return useQuery({
    queryKey: ["dedup-candidates", "contact-ids"],
    queryFn: () => api.dedupCandidates.contactIdsWithPending(),
    refetchInterval: 60_000,
    select: (data) => new Set(data.contactIds),
  });
}

export function useMergeContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keepContactId, mergeContactId }: { keepContactId: string; mergeContactId: string }) =>
      api.dedupCandidates.merge(keepContactId, mergeContactId),
    onSuccess: () => {
      toast.success("Contacts merged successfully");
      queryClient.invalidateQueries({ queryKey: ["dedup-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error: Error) => {
      toast.error(`Merge failed: ${error.message}`);
    },
  });
}

export function useDismissCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) => api.dedupCandidates.dismiss(candidateId),
    onSuccess: () => {
      toast.success("Candidate dismissed");
      queryClient.invalidateQueries({ queryKey: ["dedup-candidates"] });
    },
    onError: (error: Error) => {
      toast.error(`Dismiss failed: ${error.message}`);
    },
  });
}
