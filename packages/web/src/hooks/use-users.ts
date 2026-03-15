import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.users.list(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.users.create,
    onSuccess: () => {
      toast.success("Team member added");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message ?? "Failed to add team member";
      if (message.includes("DUPLICATE") || message.includes("already exists")) {
        toast.error("A user with this email already exists");
      } else {
        toast.error(message);
      }
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.users.remove,
    onSuccess: () => {
      toast.success("Team member removed");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
