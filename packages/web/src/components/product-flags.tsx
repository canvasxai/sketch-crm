import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ProductFlagsProps {
  isCanvasUser: boolean;
  isSketchUser: boolean;
  usesServices: boolean;
  className?: string;
}

export function ProductFlags({
  isCanvasUser,
  isSketchUser,
  usesServices,
  className,
}: ProductFlagsProps) {
  if (!isCanvasUser && !isSketchUser && !usesServices) {
    return null;
  }

  return (
    <div className={cn("flex gap-1", className)}>
      {isCanvasUser && (
        <Badge
          variant="secondary"
          className="text-[9px] px-1 py-0 rounded-sm font-medium border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        >
          Canvas
        </Badge>
      )}
      {isSketchUser && (
        <Badge
          variant="secondary"
          className="text-[9px] px-1 py-0 rounded-sm font-medium border-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
        >
          Sketch
        </Badge>
      )}
      {usesServices && (
        <Badge
          variant="secondary"
          className="text-[9px] px-1 py-0 rounded-sm font-medium border-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        >
          Services
        </Badge>
      )}
    </div>
  );
}
