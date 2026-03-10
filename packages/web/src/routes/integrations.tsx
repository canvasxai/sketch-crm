import { createRoute, redirect } from "@tanstack/react-router";
import { dashboardRoute } from "./dashboard";

// Integrations are now inline on the Contacts page.
// This route exists only as a redirect for any old bookmarks.
export const integrationsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/integrations",
  beforeLoad: () => {
    throw redirect({ to: "/contacts", search: { search: "", funnelStage: "", visibility: "", ownerId: "", page: 1 } });
  },
});
