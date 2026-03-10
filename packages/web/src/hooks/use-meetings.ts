import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.meetings.create,
    onSuccess: () => {
      toast.success("Meeting scheduled");
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}

export function useCreateEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.emails.create,
    onSuccess: () => {
      toast.success("Email saved");
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}
