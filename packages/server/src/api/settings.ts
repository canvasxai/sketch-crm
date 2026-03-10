import { Hono } from "hono";
import { z } from "zod";
import type { createOrgSettingsRepository } from "../db/repositories/org-settings.js";
import type { createVendorDomainsRepository } from "../db/repositories/vendor-domains.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";

type OrgSettingsRepo = ReturnType<typeof createOrgSettingsRepository>;
type VendorDomainsRepo = ReturnType<typeof createVendorDomainsRepository>;
type ContactsRepo = ReturnType<typeof createContactsRepository>;
type CompaniesRepo = ReturnType<typeof createCompaniesRepository>;

const domainsSchema = z.object({
  domains: z.array(z.string().min(1)).max(100),
});

const addVendorDomainSchema = z.object({
  domain: z.string().min(1),
  source: z.enum(["manual", "ai"]).default("manual"),
});

export function settingsRoutes(
  orgSettings: OrgSettingsRepo,
  vendorDomains: VendorDomainsRepo,
  contacts?: ContactsRepo,
  companies?: CompaniesRepo,
) {
  const routes = new Hono();

  // GET /internal-domains — returns the list of internal company domains
  routes.get("/internal-domains", async (c) => {
    const domains = await orgSettings.getInternalDomains();
    return c.json({ domains });
  });

  // PUT /internal-domains — update the list of internal company domains
  routes.put("/internal-domains", async (c) => {
    const body = await c.req.json();
    const parsed = domainsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      );
    }

    const domains = await orgSettings.setInternalDomains(parsed.data.domains);

    // Retroactively clean up contacts & companies from internal domains
    let purged = { contactsRemoved: 0, companiesRemoved: 0 };
    for (const domain of parsed.data.domains) {
      const domainPurge = await vendorDomains.purgeByDomain(domain);
      purged.contactsRemoved += domainPurge.contactsRemoved;
      purged.companiesRemoved += domainPurge.companiesRemoved;
    }

    return c.json({ domains, purged });
  });

  // GET /vendor-domains — returns all vendor domains with metadata
  routes.get("/vendor-domains", async (c) => {
    const domains = await vendorDomains.list();
    return c.json({ domains });
  });

  // POST /vendor-domains — add a single vendor domain
  routes.post("/vendor-domains", async (c) => {
    const body = await c.req.json();
    const parsed = addVendorDomainSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      );
    }

    const domain = await vendorDomains.add(parsed.data.domain, parsed.data.source);
    if (!domain) {
      return c.json({ error: { code: "DUPLICATE", message: "Domain already exists" } }, 409);
    }

    // Retroactively remove contacts & companies from this domain
    const purged = await vendorDomains.purgeByDomain(parsed.data.domain);

    return c.json({ domain, purged }, 201);
  });

  // DELETE /vendor-domains/:id — remove a vendor domain by ID
  routes.delete("/vendor-domains/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await vendorDomains.remove(id);

    if (!deleted) {
      return c.json({ error: { code: "NOT_FOUND", message: "Domain not found" } }, 404);
    }

    return c.json({ success: true });
  });

  return routes;
}
