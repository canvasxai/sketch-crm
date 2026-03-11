import { Hono } from "hono";
import { z } from "zod";
import type { createOpportunitiesRepository } from "../db/repositories/opportunities.js";
import type { createOpportunityStageChangesRepository } from "../db/repositories/opportunity-stage-changes.js";
import { mapRow, mapRows } from "../lib/map-row.js";

type OpportunitiesRepo = ReturnType<typeof createOpportunitiesRepository>;
type StageChangesRepo = ReturnType<typeof createOpportunityStageChangesRepository>;

const valuePeriodEnum = z.enum(["one_time", "monthly", "annual"]);

const createSchema = z.object({
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  pipelineId: z.string().min(1, "Pipeline ID is required"),
  stageId: z.string().min(1, "Stage ID is required"),
  title: z.string().optional(),
  value: z.number().int().optional(),
  valuePeriod: valuePeriodEnum.optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  closeDate: z.string().optional(),
  ownerId: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  companyId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  title: z.string().nullable().optional(),
  value: z.number().int().nullable().optional(),
  valuePeriod: valuePeriodEnum.nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  closeDate: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export function opportunitiesRoutes(
  opportunities: OpportunitiesRepo,
  stageChanges: StageChangesRepo,
) {
  const routes = new Hono();

  // List opportunities with filters and pagination
  routes.get("/", async (c) => {
    const filters = {
      pipelineId: c.req.query("pipelineId"),
      stageId: c.req.query("stageId"),
      stageType: c.req.query("stageType"),
      companyId: c.req.query("companyId"),
      contactId: c.req.query("contactId"),
      ownerId: c.req.query("ownerId"),
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
    };

    // Remove undefined values so the repo filter skips them
    const cleanFilters: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) cleanFilters[key] = value;
    }

    const [items, total] = await Promise.all([
      opportunities.list(cleanFilters),
      opportunities.count(cleanFilters),
    ]);

    return c.json({ opportunities: mapRows(items), total });
  });

  // Get a single opportunity
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const opportunity = await opportunities.findById(id);

    if (!opportunity) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Opportunity not found" } },
        404,
      );
    }

    return c.json({ opportunity: mapRow(opportunity) });
  });

  // Get stage change history for an opportunity
  routes.get("/:id/stage-changes", async (c) => {
    const opportunityId = c.req.param("id");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const offset = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

    const opportunity = await opportunities.findById(opportunityId);
    if (!opportunity) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Opportunity not found" } },
        404,
      );
    }

    const changes = await stageChanges.list({ opportunityId, limit, offset });
    return c.json({ stageChanges: mapRows(changes) });
  });

  // Create an opportunity
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

    const opportunity = await opportunities.create(parsed.data);

    // Record initial stage placement as a stage change
    await stageChanges.create({
      opportunityId: opportunity!.id,
      fromStageId: null,
      toStageId: parsed.data.stageId,
    });

    return c.json({ opportunity: mapRow(opportunity!) }, 201);
  });

  // Update an opportunity — tracks stage changes automatically
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

    const existing = await opportunities.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Opportunity not found" } },
        404,
      );
    }

    // If stage changed, record the transition
    if (parsed.data.stageId && parsed.data.stageId !== existing.stage_id) {
      await stageChanges.create({
        opportunityId: id,
        fromStageId: existing.stage_id,
        toStageId: parsed.data.stageId,
      });
    }

    const opportunity = await opportunities.update(id, parsed.data);
    return c.json({ opportunity: mapRow(opportunity!) });
  });

  // Delete an opportunity
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await opportunities.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Opportunity not found" } },
        404,
      );
    }

    await opportunities.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
