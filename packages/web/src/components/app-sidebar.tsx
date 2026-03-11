import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useDedupCandidateCount } from "@/hooks/use-dedup-candidates";
import { useSourceStatus } from "@/hooks/use-integrations";
import { useTheme } from "@/hooks/use-theme";
import {
  ArrowsClockwiseIcon,
  BuildingsIcon,
  ClockIcon,
  CopyIcon,
  DownloadSimpleIcon,
  GearSixIcon,
  KanbanIcon,
  MoonIcon,
  SignOutIcon,
  SparkleIcon,
  SunIcon,
  UsersIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
}

const primaryNav: NavItem[] = [
  { label: "Pipeline", icon: <KanbanIcon size={18} />, href: "/" },
  { label: "Companies", icon: <BuildingsIcon size={18} />, href: "/companies" },
  { label: "Contacts", icon: <UsersIcon size={18} />, href: "/contacts" },
  { label: "Duplicates", icon: <CopyIcon size={18} />, href: "/dedup-review" },
  { label: "Activities", icon: <ClockIcon size={18} />, href: "/activities" },
  { label: "Team", icon: <UsersThreeIcon size={18} />, href: "/team" },
  { label: "Imports", icon: <DownloadSimpleIcon size={18} />, href: "/import" },
  { label: "Settings", icon: <GearSixIcon size={18} />, href: "/settings" },
];

export function AppSidebar({ email }: { email: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const initials = email ? email.slice(0, 2).toUpperCase() : "??";
  const { data: dedupCount } = useDedupCandidateCount();
  const pendingDedups = dedupCount?.count ?? 0;
  const { data: sourceStatus } = useSourceStatus();
  const anySyncing =
    sourceStatus?.gmail.status === "syncing" ||
    sourceStatus?.google_calendar.status === "syncing" ||
    sourceStatus?.linkedin.status === "syncing";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary">
                <SparkleIcon size={14} weight="fill" className="text-primary-foreground" />
              </div>
              <div className="flex flex-col text-left group-data-[collapsible=icon]:hidden">
                <span className="text-base font-semibold tracking-tight">CRM</span>
                <span className="text-xs text-muted-foreground">Sales Dashboard</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.href || location.pathname.startsWith(item.href + "/")}
                    onClick={() => navigate({ to: item.href })}
                    tooltip={item.label}
                  >
                    {item.label === "Imports" && anySyncing ? (
                      <ArrowsClockwiseIcon size={18} className="animate-spin text-primary" />
                    ) : (
                      item.icon
                    )}
                    <span>{item.label}</span>
                    {item.label === "Imports" && anySyncing && (
                      <span className="ml-auto size-2 rounded-full bg-primary animate-pulse" />
                    )}
                    {item.label === "Duplicates" && pendingDedups > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-medium text-white">
                        {pendingDedups > 99 ? "99+" : pendingDedups}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={email}>
                  <div className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-medium">
                    {initials}
                  </div>
                  <div className="flex flex-col text-left group-data-[collapsible=icon]:hidden">
                    <span className="text-sm font-medium truncate max-w-[140px]">{email}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuItem onSelect={toggleTheme}>
                  {theme === "dark" ? <SunIcon size={16} className="mr-2" /> : <MoonIcon size={16} className="mr-2" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    fetch("/api/auth/logout", { method: "POST" }).then(() => {
                      window.location.href = "/login";
                    });
                  }}
                >
                  <SignOutIcon size={16} className="mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
