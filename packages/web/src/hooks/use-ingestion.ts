import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useUploadCsv() {
  return useMutation({
    mutationFn: (formData: FormData) => api.ingestion.csv(formData),
    onSuccess: (data) => {
      toast.success(
        `Import complete: ${data.result.contactsCreated} created, ${data.result.contactsUpdated} updated`,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
