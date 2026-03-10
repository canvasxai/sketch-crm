import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.users.list(),
    staleTime: 10 * 60 * 1000,
  });
}
