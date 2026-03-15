import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={cn("p-3 relative", className)}
      classNames={{
        months: "flex gap-4 relative",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center text-sm font-medium",
        nav: "flex items-center gap-1 absolute top-0 right-0 left-0 justify-between z-10",
        button_previous: "size-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
        button_next: "size-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative",
        day_button: "h-9 w-9 p-0 font-normal inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
        range_middle: "bg-accent text-accent-foreground rounded-none",
        range_start: "bg-primary text-primary-foreground rounded-r-none",
        range_end: "bg-primary text-primary-foreground rounded-l-none",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
