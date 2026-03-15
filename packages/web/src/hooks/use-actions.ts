import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useGenerateActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.actions.generate(),
    onSuccess: (data) => {
      toast.success("Action generation started");
      queryClient.invalidateQueries({ queryKey: ["action-runs"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useGenerateContactActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => api.actions.generateForContact(contactId),
    onSuccess: (data) => {
      const count = data.result.tasksCreated;
      toast.success(
        count > 0
          ? `Generated ${count} action${count === 1 ? "" : "s"}`
          : "No new actions needed",
      );
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useActionRuns() {
  return useQuery({
    queryKey: ["action-runs"],
    queryFn: () => api.actions.runs(),
    select: (data) => data.runs,
  });
}

export function useActionRun(runId: string) {
  return useQuery({
    queryKey: ["action-run", runId],
    queryFn: () => api.actions.run(runId),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === "running" ? 3000 : false;
    },
  });
}

export function useCancelActionGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.actions.cancel(),
    onSuccess: () => {
      toast.info("Action generation stopped");
      queryClient.invalidateQueries({ queryKey: ["action-runs"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
