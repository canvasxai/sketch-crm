import { Eye, EyeSlash, Binoculars } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const visibilityConfig: Record<
  string,
  { icon: React.ElementType; label: string; className: string }
> = {
  shared: {
    icon: Eye,
    label: "Shared",
    className: "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400",
  },
  private: {
    icon: EyeSlash,
    label: "Private",
    className: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  unreviewed: {
    icon: Binoculars,
    label: "Unreviewed",
    className: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400",
  },
};

interface VisibilityBadgeProps {
  visibility: string;
  className?: string;
}

export function VisibilityBadge({ visibility, className }: VisibilityBadgeProps) {
  const config = visibilityConfig[visibility];

  if (!config) {
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0 font-normal gap-0.5", className)}
      >
        {visibility}
      </Badge>
    );
  }

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 font-normal gap-0.5",
        config.className,
        className,
      )}
    >
      <Icon size={10} className="mr-0.5" />
      {config.label}
    </Badge>
  );
}
