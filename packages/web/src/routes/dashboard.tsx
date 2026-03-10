import { AppSidebar } from "@/components/app-sidebar";
import { SyncStatusBar } from "@/components/sync-status-bar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Outlet, createRoute, redirect, useRouteContext } from "@tanstack/react-router";
import { rootRoute } from "./root";

async function checkAuth() {
  const res = await fetch("/api/auth/session");
  const data = (await res.json()) as {
    authenticated: boolean;
    email?: string;
    user?: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      role: string;
    };
  };
  if (!data.authenticated) {
    throw redirect({ to: "/login" });
  }
  return data;
}

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "dashboard",
  component: DashboardLayout,
  beforeLoad: async () => {
    const auth = await checkAuth();
    return { auth };
  },
});

function DashboardLayout() {
  const { auth } = useRouteContext({ from: dashboardRoute.id });
  return (
    <SidebarProvider>
      <AppSidebar email={auth.user?.email ?? auth.email ?? ""} />
      <SidebarInset>
        <SidebarTrigger className="absolute left-3 top-3 z-20" />
        <SyncStatusBar />
        <main className="flex-1 overflow-auto pt-10">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
