import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.notes.create,
    onSuccess: (_data, variables) => {
      toast.success("Note added");
      queryClient.invalidateQueries({ queryKey: ["timeline", variables.contactId] });
    },
  });
}
