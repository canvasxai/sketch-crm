import {
  ArrowsClockwise,
  CopySimple,
  Sparkle,
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
  | "needs_review"
  | "needs_reclassification"
  | "low_confidence"
  | "ok";

export function getWorkflowStatus(
  contact: Pick<Contact, "id" | "needsClassification" | "pipeline" | "aiConfidence">,
  dedupContactIds: Set<string>,
): WorkflowStatus {
  if (dedupContactIds.has(contact.id)) return "dedup";
  if (contact.needsClassification && !contact.pipeline) return "needs_review";
  if (contact.needsClassification && contact.pipeline) return "needs_reclassification";
  if (!contact.needsClassification && contact.aiConfidence === "low")
    return "low_confidence";
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
  needs_review: {
    icon: Sparkle,
    weight: "fill",
    className: "text-amber-500",
    tooltip: "Needs classification",
  },
  needs_reclassification: {
    icon: ArrowsClockwise,
    weight: undefined,
    className: "text-amber-400",
    tooltip: "Needs re-classification",
  },
  low_confidence: {
    icon: Warning,
    weight: undefined,
    className: "text-yellow-500",
    tooltip: "Low confidence — needs human review",
  },
};

interface WorkflowStatusIconProps {
  contact: Pick<Contact, "id" | "needsClassification" | "pipeline" | "aiConfidence">;
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
