import {
  LinkedinLogo,
  RocketLaunch,
  FileText,
  PaintBrush,
  Calendar,
  PencilSimple,
  EnvelopeSimple,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sourceConfig: Record<string, { icon: React.ElementType; label: string }> = {
  linkedin: { icon: LinkedinLogo, label: "LinkedIn" },
  apollo: { icon: RocketLaunch, label: "Apollo" },
  csv: { icon: FileText, label: "CSV" },
  canvas_signup: { icon: PaintBrush, label: "Canvas" },
  calendar: { icon: Calendar, label: "Calendar" },
  google_calendar: { icon: Calendar, label: "Calendar" },
  manual: { icon: PencilSimple, label: "Manual" },
  gmail: { icon: EnvelopeSimple, label: "Gmail" },
};

interface SourceBadgeProps {
  source: string;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const config = sourceConfig[source];

  if (!config) {
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0 font-normal gap-0.5", className)}
      >
        {source}
      </Badge>
    );
  }

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 font-normal gap-0.5", className)}
    >
      <Icon size={10} className="mr-0.5" />
      {config.label}
    </Badge>
  );
}
