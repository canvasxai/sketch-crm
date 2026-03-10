import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useContactsNextUp(ids: string[]) {
  return useQuery({
    queryKey: ["insights", "contacts", "next-up", ids],
    queryFn: () => api.insights.contactsNextUp(ids),
    enabled: ids.length > 0,
  });
}

export function useCompaniesNextUp(ids: string[]) {
  return useQuery({
    queryKey: ["insights", "companies", "next-up", ids],
    queryFn: () => api.insights.companiesNextUp(ids),
    enabled: ids.length > 0,
  });
}

export function useContactsLastTouched(ids: string[]) {
  return useQuery({
    queryKey: ["insights", "contacts", "last-touched", ids],
    queryFn: () => api.insights.contactsLastTouched(ids),
    enabled: ids.length > 0,
  });
}

export function useCompaniesLastTouched(ids: string[]) {
  return useQuery({
    queryKey: ["insights", "companies", "last-touched", ids],
    queryFn: () => api.insights.companiesLastTouched(ids),
    enabled: ids.length > 0,
  });
}
