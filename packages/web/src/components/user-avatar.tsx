import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: UserAvatarProps) {
  const sizeClasses = size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs";

  return (
    <Avatar className={cn(sizeClasses, className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="bg-primary/15 font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
