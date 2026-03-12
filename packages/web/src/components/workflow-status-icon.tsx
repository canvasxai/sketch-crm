import {
  CircleDashed,
  CopySimple,
  Warning,
} from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Contact } from "@crm/shared";
import { cn } from "@/lib/utils";

export type WorkflowStatus =
  | "dedup"
  | "low_confidence"
  | "needs_classification"
  | "ok";

export function getWorkflowStatus(
  contact: Pick<Contact, "id" | "aiConfidence" | "needsClassification">,
  dedupContactIds: Set<string>,
): WorkflowStatus {
  if (dedupContactIds.has(contact.id)) return "dedup";
  if (contact.aiConfidence === "low") return "low_confidence";
  if (contact.needsClassification) return "needs_classification";
  return "ok";
}

const statusConfig: Record<
  Exclude<WorkflowStatus, "ok">,
  {
    icon: typeof CopySimple;
    weight?: "fill" | "regular";
    className: string;
    tooltip: string;
  }
> = {
  dedup: {
    icon: CopySimple,
    weight: "fill",
    className: "text-orange-500",
    tooltip: "Possible duplicate",
  },
  low_confidence: {
    icon: Warning,
    weight: undefined,
    className: "text-yellow-500",
    tooltip: "Low confidence — needs human review",
  },
  needs_classification: {
    icon: CircleDashed,
    weight: undefined,
    className: "text-blue-400",
    tooltip: "Needs classification",
  },
};

interface WorkflowStatusIconProps {
  contact: Pick<Contact, "id" | "aiConfidence" | "needsClassification">;
  dedupContactIds: Set<string>;
  onClick?: (status: WorkflowStatus) => void;
}

export function WorkflowStatusIcon({
  contact,
  dedupContactIds,
  onClick,
}: WorkflowStatusIconProps) {
  const status = getWorkflowStatus(contact, dedupContactIds);

  if (status === "ok") return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  const icon = (
    <button
      type="button"
      className={cn(
        "rounded p-0.5 transition-colors",
        config.className,
        onClick && "hover:bg-muted cursor-pointer",
      )}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick(status);
            }
          : undefined
      }
    >
      <Icon size={14} weight={config.weight ?? "regular"} />
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{icon}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
