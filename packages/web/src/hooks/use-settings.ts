import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useInternalDomains() {
  return useQuery({
    queryKey: ["settings", "internal-domains"],
    queryFn: () => api.settings.getInternalDomains(),
  });
}

export function useUpdateInternalDomains() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domains: string[]) => api.settings.setInternalDomains(domains),
    onSuccess: () => {
      toast.success("Internal domains updated");
      queryClient.invalidateQueries({
        queryKey: ["settings", "internal-domains"],
      });
    },
  });
}

export function useMutedDomains() {
  return useQuery({
    queryKey: ["settings", "muted-domains"],
    queryFn: () => api.settings.getMutedDomains(),
  });
}

export function useAddMutedDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domain, source }: { domain: string; source?: "manual" | "ai" }) =>
      api.settings.addMutedDomain(domain, source),
    onSuccess: (data) => {
      const { contactsRemoved, companiesRemoved } = data.purged;
      if (contactsRemoved > 0 || companiesRemoved > 0) {
        toast.success(
          `Muted domain added — removed ${contactsRemoved} contact${contactsRemoved !== 1 ? "s" : ""} and ${companiesRemoved} compan${companiesRemoved !== 1 ? "ies" : "y"}`,
        );
      } else {
        toast.success("Muted domain added");
      }
      queryClient.invalidateQueries({
        queryKey: ["settings", "muted-domains"],
      });
      // Also refresh contacts/companies lists since records may have been purged
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useRemoveMutedDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.settings.removeMutedDomain(id),
    onSuccess: () => {
      toast.success("Muted domain removed");
      queryClient.invalidateQueries({
        queryKey: ["settings", "muted-domains"],
      });
    },
  });
}

// Legacy aliases for backward compatibility during migration
export const useVendorDomains = useMutedDomains;
export const useAddVendorDomain = useAddMutedDomain;
export const useRemoveVendorDomain = useRemoveMutedDomain;
