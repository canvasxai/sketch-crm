import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Queries ──

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.pipelines.list(),
  });
}

export function usePipeline(id: string) {
  return useQuery({
    queryKey: ["pipelines", id],
    queryFn: () => api.pipelines.get(id),
    enabled: !!id,
  });
}

// ── Pipeline mutations ──

export function useCreatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; position?: number }) =>
      api.pipelines.create(body),
    onSuccess: () => {
      toast.success("Pipeline created");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}

export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & Partial<{ name: string; position: number }>) =>
      api.pipelines.update(id, body),
    onSuccess: () => {
      toast.success("Pipeline updated");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.pipelines.delete(id),
    onSuccess: () => {
      toast.success("Pipeline deleted");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}

// ── Stage mutations ──

export function useAddStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      ...body
    }: {
      pipelineId: string;
      label: string;
      stageType?: string;
      position?: number;
    }) => api.pipelines.addStage(pipelineId, body),
    onSuccess: () => {
      toast.success("Stage added");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}

export function useUpdateStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      stageId,
      ...body
    }: {
      stageId: string;
    } & Partial<{ label: string; stageType: string; position: number }>) =>
      api.pipelines.updateStage(stageId, body),
    onSuccess: () => {
      toast.success("Stage updated");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stageId: string) => api.pipelines.deleteStage(stageId),
    onSuccess: () => {
      toast.success("Stage removed");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}
