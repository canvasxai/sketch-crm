import { useState } from "react";
import type { CompanyCategory } from "@crm/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CategoryBadge } from "@/components/funnel-stage-badge";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: Array<{
  value: string;
  label: string;
  dot: string;
}> = [
  { value: "sales", label: "Sales", dot: "bg-blue-500" },
  { value: "client", label: "Client", dot: "bg-green-500" },
  { value: "hiring", label: "Hiring", dot: "bg-purple-500" },
  { value: "contractors", label: "Contractors", dot: "bg-orange-500" },
  { value: "investors", label: "Investors", dot: "bg-emerald-500" },
  { value: "muted", label: "Muted", dot: "bg-gray-400" },
  { value: "uncategorized", label: "Uncategorized", dot: "bg-gray-300" },
];

interface CategorySelectorProps {
  value: string | null;
  /** Filter to only these category values */
  options?: readonly string[];
  onChange: (category: string | null) => void;
  disabled?: boolean;
}

export function CategorySelector({
  value,
  options,
  onChange,
  disabled,
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false);

  const filtered = options
    ? CATEGORY_OPTIONS.filter((o) => options.includes(o.value))
    : CATEGORY_OPTIONS;

  function handleSelect(newValue: string | null) {
    onChange(newValue);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {value ? (
            <CategoryBadge pipeline={value as CompanyCategory} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-40 p-1"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {filtered.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors",
              value === opt.value && "font-medium",
            )}
            onClick={() => handleSelect(opt.value)}
          >
            <span className={cn("size-2 rounded-full", opt.dot)} />
            <span className="flex-1 text-left">{opt.label}</span>
            {value === opt.value && <Check size={12} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Legacy export for backward compatibility
export { CategorySelector as PipelineSelector };
