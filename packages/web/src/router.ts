import { createRouter } from "@tanstack/react-router";
import { activitiesRoute } from "./routes/activities";
import { companiesRoute } from "./routes/companies";
import { companyDetailRoute } from "./routes/company-detail";
import { contactDetailRoute } from "./routes/contact-detail";
import { contactsRoute } from "./routes/contacts";
import { dashboardRoute } from "./routes/dashboard";
import { dedupReviewRoute } from "./routes/dedup-review";
import { importRoute } from "./routes/import";
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
    companiesRoute,
    companyDetailRoute,
    contactsRoute,
    contactDetailRoute,
    dedupReviewRoute,
    activitiesRoute,
    importRoute,
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
