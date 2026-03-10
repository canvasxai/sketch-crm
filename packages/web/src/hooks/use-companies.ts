import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useCompanies(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["companies", params],
    queryFn: () => api.companies.list(params),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ["companies", id],
    queryFn: () => api.companies.get(id),
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.companies.create,
    onSuccess: () => {
      toast.success("Company created");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.companies.update>[1] }) =>
      api.companies.update(id, data),
    onSuccess: () => {
      toast.success("Company updated");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.companies.delete(id),
    onSuccess: () => {
      toast.success("Company deleted");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
