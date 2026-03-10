import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useContacts(params?: Parameters<typeof api.contacts.list>[0]) {
  return useQuery({
    queryKey: ["contacts", params],
    queryFn: () => api.contacts.list(params),
  });
}

export function useContactCounts() {
  return useQuery({
    queryKey: ["contacts", "counts"],
    queryFn: () => api.contacts.counts(),
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ["contacts", id],
    queryFn: () => api.contacts.get(id),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.contacts.create,
    onSuccess: () => {
      toast.success("Contact created");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.contacts.update>[1] }) =>
      api.contacts.update(id, data),
    onSuccess: (_data, variables) => {
      toast.success("Contact updated");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", variables.id] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.contacts.delete(id),
    onSuccess: () => {
      toast.success("Contact deleted");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useBatchUpdateContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { ids: string[]; visibility: string }) =>
      api.contacts.batchUpdate(body),
    onSuccess: (_data, variables) => {
      toast.success(`${variables.ids.length} contacts updated`);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useBatchDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => api.contacts.batchDelete(ids),
    onSuccess: (_data, variables) => {
      toast.success(`${variables.length} contacts deleted`);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
