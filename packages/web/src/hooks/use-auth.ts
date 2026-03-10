import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useSession() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => api.auth.session(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      window.location.href = "/login";
    },
  });
}
