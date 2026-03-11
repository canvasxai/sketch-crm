import { Hono } from "hono";
import { z } from "zod";
import type { createPipelinesRepository } from "../db/repositories/pipelines.js";
import type { createPipelineStagesRepository } from "../db/repositories/pipeline-stages.js";
import { mapRow, mapRows } from "../lib/map-row.js";

type PipelinesRepo = ReturnType<typeof createPipelinesRepository>;
type PipelineStagesRepo = ReturnType<typeof createPipelineStagesRepository>;

const stageTypeEnum = z.enum(["active", "won", "lost"]);

const createPipelineSchema = z.object({
  name: z.string().min(1, "Name is required"),
  position: z.number().int().optional(),
});

const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.number().int().optional(),
});

const createStageSchema = z.object({
  label: z.string().min(1, "Label is required"),
  stageType: stageTypeEnum.optional(),
  position: z.number().int().optional(),
});

const updateStageSchema = z.object({
  label: z.string().min(1).optional(),
  stageType: stageTypeEnum.optional(),
  position: z.number().int().optional(),
});

export function pipelinesRoutes(
  pipelines: PipelinesRepo,
  pipelineStages: PipelineStagesRepo,
) {
  const routes = new Hono();

  // ── Pipeline CRUD ──

  // List all pipelines with their stages
  routes.get("/", async (c) => {
    const allPipelines = await pipelines.list();
    const allStages = await pipelineStages.listAll();

    // Group stages by pipeline
    const stagesByPipeline: Record<string, typeof allStages> = {};
    for (const stage of allStages) {
      const pid = stage.pipeline_id;
      if (!stagesByPipeline[pid]) stagesByPipeline[pid] = [];
      stagesByPipeline[pid].push(stage);
    }

    const pipelinesWithStages = allPipelines.map((p) => ({
      ...mapRow(p),
      stages: mapRows(stagesByPipeline[p.id] ?? []),
    }));

    return c.json({ pipelines: pipelinesWithStages });
  });

  // Get a single pipeline with stages
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const pipeline = await pipelines.findById(id);

    if (!pipeline) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Pipeline not found" } },
        404,
      );
    }

    const stages = await pipelineStages.listByPipeline(id);
    return c.json({ pipeline: { ...mapRow(pipeline), stages: mapRows(stages) } });
  });

  // Create a pipeline
  routes.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = createPipelineSchema.safeParse(body);

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
      const pipeline = await pipelines.create(parsed.data);
      return c.json({ pipeline: { ...mapRow(pipeline), stages: [] } }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate key")) {
        return c.json(
          {
            error: {
              code: "DUPLICATE",
              message: "A pipeline with this name already exists",
            },
          },
          409,
        );
      }
      throw err;
    }
  });

  // Update a pipeline
  routes.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updatePipelineSchema.safeParse(body);

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

    const existing = await pipelines.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Pipeline not found" } },
        404,
      );
    }

    const pipeline = await pipelines.update(id, parsed.data);
    const stages = await pipelineStages.listByPipeline(id);
    return c.json({ pipeline: { ...mapRow(pipeline), stages: mapRows(stages) } });
  });

  // Delete a pipeline
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await pipelines.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Pipeline not found" } },
        404,
      );
    }

    await pipelines.remove(id);
    return c.json({ success: true });
  });

  // ── Stage CRUD (nested under pipeline) ──

  // Add a stage to a pipeline
  routes.post("/:id/stages", async (c) => {
    const pipelineId = c.req.param("id");
    const body = await c.req.json();
    const parsed = createStageSchema.safeParse(body);

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

    const pipeline = await pipelines.findById(pipelineId);
    if (!pipeline) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Pipeline not found" } },
        404,
      );
    }

    const stage = await pipelineStages.create({
      pipelineId,
      label: parsed.data.label,
      stageType: parsed.data.stageType,
      position: parsed.data.position,
    });

    return c.json({ stage: mapRow(stage) }, 201);
  });

  return routes;
}

// ── Standalone stage routes (for PATCH/DELETE by stage ID) ──

export function pipelineStagesRoutes(pipelineStages: PipelineStagesRepo) {
  const routes = new Hono();

  // Update a stage
  routes.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateStageSchema.safeParse(body);

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

    const existing = await pipelineStages.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Stage not found" } },
        404,
      );
    }

    const stage = await pipelineStages.update(id, parsed.data);
    return c.json({ stage: mapRow(stage) });
  });

  // Delete a stage
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await pipelineStages.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Stage not found" } },
        404,
      );
    }

    await pipelineStages.remove(id);
    return c.json({ success: true });
  });

  return routes;
}
