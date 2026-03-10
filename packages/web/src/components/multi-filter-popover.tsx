import { Check, FunnelSimple } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface MultiFilterPopoverProps {
  /** Label shown when nothing is selected, e.g. "All stages" */
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Align popover. Default "start" */
  align?: "start" | "center" | "end";
}

export function MultiFilterPopover({
  label,
  options,
  selected,
  onChange,
  align = "start",
}: MultiFilterPopoverProps) {
  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const activeCount = selected.size;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs transition-colors hover:bg-muted",
            activeCount > 0
              ? "text-foreground font-medium"
              : "text-muted-foreground",
          )}
        >
          <FunnelSimple size={12} />
          {activeCount > 0 ? `${label.replace("All ", "")} (${activeCount})` : label}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-48 p-2">
        <div className="space-y-0.5">
          {options.map((opt) => {
            const isActive = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {isActive && <Check size={10} weight="bold" />}
                </div>
                {opt.label}
              </button>
            );
          })}
          {activeCount > 0 && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
