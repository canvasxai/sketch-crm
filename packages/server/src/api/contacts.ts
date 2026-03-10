import { Hono } from "hono";
import { z } from "zod";
import { getCookie } from "hono/cookie";
import type { Config } from "../config.js";
import { verifyJwt } from "../auth/jwt.js";
import { SESSION_COOKIE } from "./auth.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createUsersRepository } from "../db/repositories/users.js";
import type { createStageChangesRepository } from "../db/repositories/stage-changes.js";
import type { createDedupLogRepository } from "../db/repositories/dedup-log.js";
import {
  extractDomain,
  isPersonalEmailDomain,
  domainToCompanyName,
} from "../lib/domains.js";

type ContactsRepo = ReturnType<typeof createContactsRepository>;
type CompaniesRepo = ReturnType<typeof createCompaniesRepository>;
type UsersRepo = ReturnType<typeof createUsersRepository>;
type StageChangesRepo = ReturnType<typeof createStageChangesRepository>;
type DedupLogRepo = ReturnType<typeof createDedupLogRepository>;

const leadChannelEnum = z.enum([
  "outbound_email", "outbound_linkedin", "instagram", "referral",
  "inbound", "conference", "cold_call", "organic",
]);

const contactEmailEntrySchema = z.object({
  email: z.string().email(),
  type: z.string(),
  isPrimary: z.boolean(),
});

const contactPhoneEntrySchema = z.object({
  phone: z.string(),
  type: z.string(),
  isPrimary: z.boolean(),
});

const funnelStageEnum = z.enum([
  "new",
  "qualified",
  "opportunity",
  "customer",
  "dormant",
  "lost",
]);

const sourceEnum = z.enum([
  "linkedin",
  "apollo",
  "canvas_signup",
  "csv",
  "calendar",
  "manual",
  "gmail",
]);

const visibilityEnum = z.enum(["private", "shared", "unreviewed"]);

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  companyId: z.string().optional(),
  source: sourceEnum,
  funnelStage: funnelStageEnum.optional(),
  isCanvasUser: z.boolean().optional(),
  isSketchUser: z.boolean().optional(),
  usesServices: z.boolean().optional(),
  canvasSignupDate: z.string().optional(),
  autoCreateCompany: z.boolean().optional(),
  visibility: visibilityEnum.optional(),
  leadChannel: leadChannelEnum.nullable().optional(),
  emails: z.array(contactEmailEntrySchema).optional(),
  phones: z.array(contactPhoneEntrySchema).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  companyId: z.string().nullable().optional(),
  source: sourceEnum.optional(),
  funnelStage: funnelStageEnum.optional(),
  isCanvasUser: z.boolean().optional(),
  isSketchUser: z.boolean().optional(),
  usesServices: z.boolean().optional(),
  canvasSignupDate: z.string().nullable().optional(),
  visibility: visibilityEnum.optional(),
  leadChannel: leadChannelEnum.nullable().optional(),
  emails: z.array(contactEmailEntrySchema).optional(),
  phones: z.array(contactPhoneEntrySchema).optional(),
});

const matchSchema = z.object({
  email: z.string().email().optional(),
  linkedinUrl: z.string().optional(),
});

const bulkCreateSchema = z.object({
  contacts: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      title: z.string().optional(),
      linkedinUrl: z.string().optional(),
      companyId: z.string().optional(),
      funnelStage: funnelStageEnum.optional(),
      isCanvasUser: z.boolean().optional(),
      isSketchUser: z.boolean().optional(),
      usesServices: z.boolean().optional(),
      canvasSignupDate: z.string().optional(),
    }),
  ),
  source: sourceEnum,
});

const batchUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  visibility: visibilityEnum,
});

const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

async function getCurrentUserId(
  c: { req: { raw: Request } },
  config: Config,
  users: UsersRepo,
): Promise<string | null> {
  const cookie = getCookie(c as never, SESSION_COOKIE);
  if (!cookie) return null;
  const payload = await verifyJwt(cookie, config.JWT_SECRET);
  if (!payload?.email) return null;
  const user = await users.findByEmail(payload.email);
  return user?.id ?? null;
}

export function contactsRoutes(
  repo: ContactsRepo,
  companiesRepo: CompaniesRepo,
  users: UsersRepo,
  stageChanges: StageChangesRepo,
  config: Config,
  dedupLog?: DedupLogRepo,
) {
  const routes = new Hono();

  // GET /counts — source + visibility breakdowns for filter pills
  routes.get("/counts", async (c) => {
    const currentUserId = await getCurrentUserId(c, config, users);

    const baseFilters = {
      currentUserId: currentUserId ?? undefined,
    };

    const [sourceCounts, visibilityCounts, total] = await Promise.all([
      repo.countBySource(baseFilters),
      repo.countByVisibility(baseFilters),
      repo.count(baseFilters),
    ]);

    return c.json({ sourceCounts, visibilityCounts, total });
  });

  // List contacts with filters and pagination
  routes.get("/", async (c) => {
    const currentUserId = await getCurrentUserId(c, config, users);

    const filters = {
      funnelStage: c.req.query("funnelStage") as
        | "new"
        | "qualified"
        | "opportunity"
        | "customer"
        | "dormant"
        | "lost"
        | undefined,
      source: c.req.query("source"),
      companyId: c.req.query("companyId"),
      ownerId: c.req.query("ownerId"),
      visibility: c.req.query("visibility"),
      isCanvasUser: c.req.query("isCanvasUser")
        ? c.req.query("isCanvasUser") === "true"
        : undefined,
      isSketchUser: c.req.query("isSketchUser")
        ? c.req.query("isSketchUser") === "true"
        : undefined,
      usesServices: c.req.query("usesServices")
        ? c.req.query("usesServices") === "true"
        : undefined,
      search: c.req.query("search"),
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
      currentUserId: currentUserId ?? undefined,
    };

    const [contacts, total] = await Promise.all([
      repo.list(filters),
      repo.count(filters),
    ]);

    return c.json({ contacts, total });
  });

  // Dedup/match endpoint
  routes.post("/match", async (c) => {
    const body = await c.req.json();
    const parsed = matchSchema.safeParse(body);

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

    const result = await repo.findDuplicate(parsed.data);

    if (result) {
      return c.json({ contact: result.contact, matchedOn: result.matchedOn });
    }

    return c.json({ contact: null, matchedOn: null });
  });

  // Batch update visibility
  routes.patch("/batch", async (c) => {
    const body = await c.req.json();
    const parsed = batchUpdateSchema.safeParse(body);

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

    const updated = await repo.batchUpdateVisibility(
      parsed.data.ids,
      parsed.data.visibility,
    );

    return c.json({ updated });
  });

  // Batch delete contacts (emails cascade-delete)
  routes.post("/batch-delete", async (c) => {
    const body = await c.req.json();
    const parsed = batchDeleteSchema.safeParse(body);

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

    const deleted = await repo.batchDelete(parsed.data.ids);
    return c.json({ deleted });
  });

  // Bulk create contacts
  routes.post("/bulk", async (c) => {
    const body = await c.req.json();
    const parsed = bulkCreateSchema.safeParse(body);

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

    const { contacts: contactsData, source } = parsed.data;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < contactsData.length; i++) {
      const contactData = contactsData[i];
      try {
        // Check for duplicate
        const dup = await repo.findDuplicate({
          email: contactData.email,
          linkedinUrl: contactData.linkedinUrl,
        });

        if (dup) {
          // Merge: fill in missing fields only
          const updateData: Record<string, unknown> = {};
          if (!dup.contact.name && contactData.name) updateData.name = contactData.name;
          if (!dup.contact.email && contactData.email) updateData.email = contactData.email;
          if (!dup.contact.phone && contactData.phone) updateData.phone = contactData.phone;
          if (!dup.contact.title && contactData.title) updateData.title = contactData.title;
          if (!dup.contact.linkedin_url && contactData.linkedinUrl) {
            updateData.linkedinUrl = contactData.linkedinUrl;
          }

          if (Object.keys(updateData).length > 0) {
            await repo.update(dup.contact.id, updateData);
            updated++;
          } else {
            skipped++;
          }
        } else {
          await repo.create({
            ...contactData,
            source,
          });
          created++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push({ index: i, message });
      }
    }

    return c.json({ created, updated, skipped, errors });
  });

  // Get a single contact with owners
  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    const contact = await repo.findById(id);

    if (!contact) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Contact not found" } },
        404,
      );
    }

    const owners = await repo.getOwners(id);
    return c.json({ contact: { ...contact, owners } });
  });

  // Create a contact with dedup check and optional auto-create company
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

    const { autoCreateCompany, ...contactData } = parsed.data;

    // Dedup check
    const dup = await repo.findDuplicate({
      email: contactData.email,
      linkedinUrl: contactData.linkedinUrl,
    });

    if (dup) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: `Duplicate contact found (matched on ${dup.matchedOn})`,
          },
          existingContact: dup.contact,
        },
        409,
      );
    }

    // Auto-create company from email domain if requested
    let companyId = contactData.companyId;
    if (autoCreateCompany && !companyId && contactData.email) {
      const domain = extractDomain(contactData.email);
      if (domain && !isPersonalEmailDomain(domain)) {
        const company = await companiesRepo.findOrCreateByDomain(domain, {
          name: domainToCompanyName(domain),
          source: contactData.source,
        });
        companyId = company.id;
      }
    }

    // Manually created contacts default to shared visibility
    const contact = await repo.create({
      ...contactData,
      companyId,
      visibility: contactData.visibility ?? "shared",
    });

    return c.json({ contact }, 201);
  });

  // Update a contact
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
        { error: { code: "NOT_FOUND", message: "Contact not found" } },
        404,
      );
    }

    // Auto-track stage changes
    if (parsed.data.funnelStage && parsed.data.funnelStage !== existing.funnel_stage) {
      const currentUserId = await getCurrentUserId(c, config, users);
      await stageChanges.create({
        contactId: id,
        fromStage: existing.funnel_stage,
        toStage: parsed.data.funnelStage,
        changedBy: currentUserId ?? undefined,
      });
    }

    const contact = await repo.update(id, parsed.data);
    return c.json({ contact });
  });

  // Delete a contact
  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await repo.findById(id);
    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Contact not found" } },
        404,
      );
    }

    await repo.remove(id);
    return c.json({ success: true });
  });

  // Add owner to contact
  routes.post("/:id/owners/:userId", async (c) => {
    const contactId = c.req.param("id");
    const userId = c.req.param("userId");

    const contact = await repo.findById(contactId);
    if (!contact) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Contact not found" } },
        404,
      );
    }

    try {
      await repo.addOwner(contactId, userId);
      return c.json({ success: true }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate key")) {
        return c.json(
          {
            error: {
              code: "DUPLICATE",
              message: "Owner already assigned to this contact",
            },
          },
          409,
        );
      }
      throw err;
    }
  });

  // Remove owner from contact
  routes.delete("/:id/owners/:userId", async (c) => {
    const contactId = c.req.param("id");
    const userId = c.req.param("userId");

    try {
      await repo.removeOwner(contactId, userId);
      return c.json({ success: true });
    } catch {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Owner assignment not found" } },
        404,
      );
    }
  });

  // ── Dedup log endpoints ──

  // GET /dedup-log/unreviewed — list all unreviewed dedup events
  routes.get("/dedup-log/unreviewed", async (c) => {
    if (!dedupLog) return c.json({ logs: [] });
    const logs = await dedupLog.listUnreviewed();
    return c.json({
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        mergedEmail: l.merged_email,
        mergedName: l.merged_name,
        matchReason: l.match_reason,
        aiConfidence: l.ai_confidence,
        reviewed: l.reviewed,
        createdAt: l.created_at,
      })),
    });
  });

  // POST /dedup-log/:logId/review — mark a dedup event as reviewed
  routes.post("/dedup-log/:logId/review", async (c) => {
    if (!dedupLog) {
      return c.json({ error: { code: "NOT_CONFIGURED", message: "Dedup log not configured" } }, 500);
    }
    const logId = c.req.param("logId");
    try {
      const log = await dedupLog.markReviewed(logId);
      return c.json({
        log: {
          id: log.id,
          contactId: log.contact_id,
          mergedEmail: log.merged_email,
          mergedName: log.merged_name,
          matchReason: log.match_reason,
          aiConfidence: log.ai_confidence,
          reviewed: log.reviewed,
          createdAt: log.created_at,
        },
      });
    } catch {
      return c.json({ error: { code: "NOT_FOUND", message: "Dedup log entry not found" } }, 404);
    }
  });

  // GET /:id/dedup-log — dedup history for a specific contact
  routes.get("/:id/dedup-log", async (c) => {
    if (!dedupLog) return c.json({ logs: [] });
    const contactId = c.req.param("id");
    const logs = await dedupLog.listByContact(contactId);
    return c.json({
      logs: logs.map((l) => ({
        id: l.id,
        contactId: l.contact_id,
        mergedEmail: l.merged_email,
        mergedName: l.merged_name,
        matchReason: l.match_reason,
        aiConfidence: l.ai_confidence,
        reviewed: l.reviewed,
        createdAt: l.created_at,
      })),
    });
  });

  return routes;
}
