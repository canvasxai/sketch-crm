import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useTimeline(params: {
  contactId?: string;
  companyId?: string;
  type?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["timeline", params],
    queryFn: () => api.timeline.list(params),
    enabled: !!(params.contactId || params.companyId),
  });
}

/** Fetch a global timeline across all contacts. */
export function useGlobalTimeline(params: {
  type?: string;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ["timeline", "global", params],
    queryFn: () => api.timeline.list(params),
  });
}
