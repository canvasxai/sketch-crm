import type { CompanyPipeline } from "@crm/shared";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const pipelineConfig: Record<CompanyPipeline, { label: string; className: string }> = {
  uncategorized: {
    label: "Uncategorized",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  sales: {
    label: "Sales",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  client: {
    label: "Client",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  connected: {
    label: "Connected",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  },
  muted: {
    label: "Muted",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  },
  hiring: {
    label: "Hiring",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
};

interface PipelineBadgeProps {
  pipeline: CompanyPipeline;
}

export function PipelineBadge({ pipeline }: PipelineBadgeProps) {
  const config = pipelineConfig[pipeline];

  if (!config) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 font-medium border-0"
      >
        {pipeline}
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

// Keep legacy export name for easy migration
export { PipelineBadge as FunnelStageBadge };
