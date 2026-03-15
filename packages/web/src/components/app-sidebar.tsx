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
import { useTheme } from "@/hooks/use-theme";
import {
  AddressBookIcon,
  ClockIcon,
  GearSixIcon,
  KanbanIcon,
  MoonIcon,
  SignOutIcon,
  SparkleIcon,
  SunIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
}

const primaryNav: NavItem[] = [
  { label: "Categories", icon: <KanbanIcon size={18} />, href: "/" },
  { label: "Directory", icon: <AddressBookIcon size={18} />, href: "/directory" },
  { label: "Activities", icon: <ClockIcon size={18} />, href: "/activities" },
  { label: "Team", icon: <UsersThreeIcon size={18} />, href: "/team" },
  { label: "Settings", icon: <GearSixIcon size={18} />, href: "/settings" },
];

export function AppSidebar({ email }: { email: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const initials = email ? email.slice(0, 2).toUpperCase() : "??";

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
                    {item.icon}
                    <span>{item.label}</span>
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
