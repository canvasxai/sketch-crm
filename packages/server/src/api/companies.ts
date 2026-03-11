import { Hono } from "hono";
import { z } from "zod";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import { mapRow, mapRows } from "../lib/map-row.js";

type CompaniesRepo = ReturnType<typeof createCompaniesRepository>;
type ContactsRepo = ReturnType<typeof createContactsRepository>;

const pipelineEnum = z.enum(["uncategorized", "sales", "client", "connected", "muted", "hiring"]);

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  location: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  techStack: z.string().optional(),
  fundingStage: z.string().optional(),
  pipeline: pipelineEnum.optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  source: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  techStack: z.string().nullable().optional(),
  fundingStage: z.string().nullable().optional(),
  pipeline: pipelineEnum.optional(),
  /** When true and pipeline is changing, also update all contacts of this company */
  propagateToContacts: z.boolean().optional(),
});

export function companiesRoutes(repo: CompaniesRepo, contacts?: ContactsRepo) {
  const routes = new Hono();

  // List companies with search, pipeline filter, pagination
  routes.get("/", async (c) => {
    const search = c.req.query("search");
    const pipeline = c.req.query("pipeline");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const offset = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

    const [companies, total] = await Promise.all([
      repo.list({ search, pipeline, limit, offset }),
      repo.count({ search }),
    ]);

    return c.json({ companies: mapRows(companies), total });
  });

  // Match company by domain
  routes.get("/match", async (c) => {
    const domain = c.req.query("domain");

    if (!domain) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Query parameter 'domain' is required",
          },
        },
        400,
      );
    }

    const company = await repo.findByDomain(domain);
    return c.json({ company: company ? mapRow(company) : null });
  });

  // Get a single company with owners
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const company = await repo.findById(id);

    if (!company) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Company not found" } },
        404,
      );
    }

    const owners = await repo.getOwners(id);
    return c.json({ company: { ...mapRow(company), owners } });
  });

  // Create a company
  routes.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = createSchema.safeParse(body);

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

    try {
      const company = await repo.create(parsed.data);
      return c.json({ company: mapRow(company) }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate key")) {
        return c.json(
          {
            error: {
              code: "DUPLICATE",
              message: "A company with this domain already exists",
            },
          },
          409,
        );
      }
      throw err;
    }
  });

  // Update a company
  routes.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateSchema.safeParse(body);

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

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Company not found" } },
        404,
      );
    }

    // Extract propagateToContacts before passing to repo (it's not a company column)
    const { propagateToContacts, ...companyData } = parsed.data;

    const company = await repo.update(id, companyData);

    // Propagate pipeline to all contacts of this company
    let contactsUpdated = 0;
    if (propagateToContacts && companyData.pipeline && contacts) {
      contactsUpdated = await contacts.updatePipelineByCompanyId(id, companyData.pipeline);
      console.log(`[companies] Propagated pipeline "${companyData.pipeline}" to ${contactsUpdated} contacts of company ${id}`);
    }

    return c.json({ company: mapRow(company), contactsUpdated });
  });

  // Delete a company
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Company not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  // Add owner to company
  routes.post("/:id/owners/:userId", async (c) => {
    const companyId = c.req.param("id");
    const userId = c.req.param("userId");

    const company = await repo.findById(companyId);
    if (!company) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Company not found" } },
        404,
      );
    }

    try {
      await repo.addOwner(companyId, userId);
      return c.json({ success: true }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate key")) {
        return c.json(
          {
            error: {
              code: "DUPLICATE",
              message: "Owner already assigned to this company",
            },
          },
          409,
        );
      }
      throw err;
    }
  });

  // Remove owner from company
  routes.delete("/:id/owners/:userId", async (c) => {
    const companyId = c.req.param("id");
    const userId = c.req.param("userId");

    try {
      await repo.removeOwner(companyId, userId);
      return c.json({ success: true });
    } catch {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Owner assignment not found" } },
        404,
      );
    }
  });

  return routes;
}
