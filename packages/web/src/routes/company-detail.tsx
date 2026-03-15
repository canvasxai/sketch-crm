import { useEffect } from "react";
import { createRoute, useNavigate, useParams } from "@tanstack/react-router";
import { dashboardRoute } from "./dashboard";

export const companyDetailRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/companies/$id",
  component: CompanyDetailRedirect,
});

/**
 * Legacy route — redirects to the companies list with the drawer open.
 */
function CompanyDetailRedirect() {
  const { id } = useParams({ from: companyDetailRoute.id });
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/directory", search: { tab: "companies", search: "", category: "", visibility: "", ownerId: "", page: 1, open: id }, replace: true });
  }, [id, navigate]);

  return null;
}
