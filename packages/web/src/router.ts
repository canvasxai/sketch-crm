import { createRouter } from "@tanstack/react-router";
import { activitiesRoute } from "./routes/activities";
import { companyDetailRoute } from "./routes/company-detail";
import { contactDetailRoute } from "./routes/contact-detail";
import { dashboardRoute } from "./routes/dashboard";
import { directoryRoute } from "./routes/directory";
import { integrationsRoute } from "./routes/integrations";
import { loginRoute } from "./routes/login";
import { pipelineRoute } from "./routes/pipeline";
import { rootRoute } from "./routes/root";
import { settingsRoute } from "./routes/settings";
import { teamRoute } from "./routes/team";

const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute.addChildren([
    pipelineRoute,
    directoryRoute,
    companyDetailRoute,
    contactDetailRoute,
    activitiesRoute,
    teamRoute,
    integrationsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
