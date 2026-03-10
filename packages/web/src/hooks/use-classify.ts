import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useClassifyContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.classify.contacts(),
    onSuccess: (data) => {
      toast.success(
        `Classified ${data.result.classified} contacts, ${data.result.changed} updated`,
      );
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
