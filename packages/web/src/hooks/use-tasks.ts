import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useTasks(params?: {
  contactId?: string;
  companyId?: string;
  assigneeId?: string;
  completed?: boolean;
}) {
  return useQuery({
    queryKey: ["tasks", params],
    queryFn: () => api.tasks.list(params),
    enabled: !!(params?.contactId || params?.companyId || params?.assigneeId),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.tasks.create,
    onSuccess: () => {
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.tasks.update>[1]) =>
      api.tasks.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.tasks.delete,
    onSuccess: () => {
      toast.success("Task deleted");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}
