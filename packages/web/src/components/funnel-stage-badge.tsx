import type { FunnelStage } from "@crm/shared";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const stageConfig: Record<FunnelStage, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  qualified: {
    label: "Qualified",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  opportunity: {
    label: "Opportunity",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  customer: {
    label: "Customer",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  dormant: {
    label: "Dormant",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  lost: {
    label: "Lost",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

interface FunnelStageBadgeProps {
  stage: FunnelStage;
}

export function FunnelStageBadge({ stage }: FunnelStageBadgeProps) {
  const config = stageConfig[stage];

  if (!config) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 font-medium border-0"
      >
        {stage}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] px-1.5 py-0 font-medium border-0",
        config.className,
      )}
    >
      {config.label}
    </Badge>
  );
}
