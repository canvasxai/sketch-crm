import type { CompanyCategory } from "@crm/shared";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const categoryConfig: Record<CompanyCategory, { label: string; className: string }> = {
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
  muted: {
    label: "Muted",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  },
  hiring: {
    label: "Hiring",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  contractors: {
    label: "Contractors",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  investors: {
    label: "Investors",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

interface CategoryBadgeProps {
  pipeline: CompanyCategory;
}

export function CategoryBadge({ pipeline }: CategoryBadgeProps) {
  const config = categoryConfig[pipeline];

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

// Keep legacy export names for easy migration
export { CategoryBadge as PipelineBadge, CategoryBadge as FunnelStageBadge };
