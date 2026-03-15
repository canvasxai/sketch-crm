import { Hono } from "hono";
import { z } from "zod";
import { getCookie } from "hono/cookie";
import type { Config } from "../config.js";
import { verifyJwt } from "../auth/jwt.js";
import { SESSION_COOKIE } from "./auth.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createUsersRepository } from "../db/repositories/users.js";
import type { createDedupLogRepository } from "../db/repositories/dedup-log.js";
import type { createDedupCandidatesRepository } from "../db/repositories/dedup-candidates.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import {
  extractDomain,
  isPersonalEmailDomain,
  domainToCompanyName,
} from "../lib/domains.js";
import { computeMergeUpdate } from "../lib/dedup.js";
import { mapRow, mapRows } from "../lib/map-row.js";
import { createBedrockClient } from "../lib/bedrock.js";
import { createCanvasClient } from "../lib/canvas-client.js";
import { enrichContactLinkedin, shouldEnrichForCategory } from "../lib/cross-source-dedup.js";

type ContactsRepo = ReturnType<typeof createContactsRepository>;
type CompaniesRepo = ReturnType<typeof createCompaniesRepository>;
type UsersRepo = ReturnType<typeof createUsersRepository>;
type DedupLogRepo = ReturnType<typeof createDedupLogRepository>;
type DedupCandidatesRepo = ReturnType<typeof createDedupCandidatesRepository>;
type EmailsRepo = ReturnType<typeof createEmailsRepository>;
type LinkedinMessagesRepo = ReturnType<typeof createLinkedinMessagesRepository>;

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
  category: z.string().optional(),
  isCanvasUser: z.boolean().optional(),
  isSketchUser: z.boolean().optional(),
  usesServices: z.boolean().optional(),
  isDecisionMaker: z.boolean().optional(),
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
  category: z.string().optional(),
  isCanvasUser: z.boolean().optional(),
  isSketchUser: z.boolean().optional(),
  usesServices: z.boolean().optional(),
  isDecisionMaker: z.boolean().optional(),
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
      category: z.string().optional(),
      isCanvasUser: z.boolean().optional(),
      isSketchUser: z.boolean().optional(),
      usesServices: z.boolean().optional(),
      isDecisionMaker: z.boolean().optional(),
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

/**
 * Merge two contacts: transfers emails, linkedin messages, owners, and fields
 * from mergeContact into keepContact, then deletes mergeContact.
 */
export async function mergeContacts(
  keepContactId: string,
  mergeContactId: string,
  deps: {
    contacts: ContactsRepo;
    emails?: EmailsRepo;
    linkedinMessages?: LinkedinMessagesRepo;
    dedupCandidates?: DedupCandidatesRepo;
  },
): Promise<void> {
  const keepContact = await deps.contacts.findById(keepContactId);
  const mergeContact = await deps.contacts.findById(mergeContactId);
  if (!keepContact || !mergeContact) throw new Error("One or both contacts not found");

  // 1. Transfer related records
  if (deps.emails) {
    const mergeEmails = await deps.emails.list({ contactId: mergeContactId });
    for (const email of mergeEmails) {
      await deps.emails.update(email.id, { contactId: keepContactId });
    }
  }
  if (deps.linkedinMessages) {
    const mergeMessages = await deps.linkedinMessages.list({ contactId: mergeContactId });
    for (const msg of mergeMessages) {
      await deps.linkedinMessages.update(msg.id, { contactId: keepContactId });
    }
  }
  // Transfer meetings, tasks, notes, opportunities
  await deps.contacts.transferRelatedRecords(mergeContactId, keepContactId);

  // 2. Merge fields (fill gaps only)
  const mergeFields = computeMergeUpdate(
    {
      email: keepContact.email,
      phone: keepContact.phone,
      title: keepContact.title,
      linkedin_url: keepContact.linkedin_url,
      company_id: keepContact.company_id,
      aimfox_lead_id: keepContact.aimfox_lead_id,
      aimfox_profile_data: keepContact.aimfox_profile_data,
      ai_summary: keepContact.ai_summary,
    },
    {
      email: mergeContact.email,
      phone: mergeContact.phone,
      title: mergeContact.title,
      linkedin_url: mergeContact.linkedin_url,
      company_id: mergeContact.company_id,
      aimfox_lead_id: mergeContact.aimfox_lead_id,
      aimfox_profile_data: mergeContact.aimfox_profile_data,
      ai_summary: mergeContact.ai_summary,
    },
  );

  const updateData: Record<string, unknown> = {};
  if (mergeFields.email !== undefined) updateData.email = mergeFields.email;
  if (mergeFields.phone !== undefined) updateData.phone = mergeFields.phone;
  if (mergeFields.title !== undefined) updateData.title = mergeFields.title;
  if (mergeFields.linkedin_url !== undefined) updateData.linkedinUrl = mergeFields.linkedin_url;
  if (mergeFields.company_id !== undefined) updateData.companyId = mergeFields.company_id;
  if (mergeFields.aimfox_lead_id !== undefined) updateData.aimfoxLeadId = mergeFields.aimfox_lead_id;
  if (mergeFields.aimfox_profile_data !== undefined) updateData.aimfoxProfileData = mergeFields.aimfox_profile_data;

  // 3. Append mergeContact's email
  if (mergeContact.email) {
    await deps.contacts.appendEmail(keepContactId, {
      email: mergeContact.email,
      type: "work",
      isPrimary: false,
    });
  }

  // 4. Apply merged field updates
  if (Object.keys(updateData).length > 0) {
    await deps.contacts.update(keepContactId, updateData);
  }

  // 5. Transfer owners
  const mergeOwners = await deps.contacts.getOwners(mergeContactId);
  for (const owner of mergeOwners) {
    await deps.contacts.addOwner(keepContactId, owner.id);
  }

  // 6. Resolve dedup candidates
  if (deps.dedupCandidates) {
    await deps.dedupCandidates.resolveByContactId(mergeContactId, "merged");
  }

  // 7. Delete merged contact
  await deps.contacts.remove(mergeContactId);
}

export function contactsRoutes(
  repo: ContactsRepo,
  companiesRepo: CompaniesRepo,
  users: UsersRepo,
  config: Config,
  dedupLog?: DedupLogRepo,
  dedupCandidates?: DedupCandidatesRepo,
  emails?: EmailsRepo,
  linkedinMessages?: LinkedinMessagesRepo,
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
      category: c.req.query("category"),
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
      isDecisionMaker: c.req.query("isDecisionMaker")
        ? c.req.query("isDecisionMaker") === "true"
        : undefined,
      search: c.req.query("search"),
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
      currentUserId: currentUserId ?? undefined,
    };

    console.log(`[contacts] GET / currentUserId=${currentUserId}, visibility filter active=${!!currentUserId}`);

    const [contacts, total] = await Promise.all([
      repo.list(filters),
      repo.count(filters),
    ]);

    console.log(`[contacts] Returned ${contacts.length} of ${total} contacts`);

    // Batch-fetch owners for all contacts in this page
    const contactIds = contacts.map((ct) => ct.id);
    const ownersByContact = await repo.getOwnersBatch(contactIds);

    const contactsWithOwners = contacts.map((ct) => ({
      ...mapRow(ct),
      owners: ownersByContact[ct.id] ?? [],
    }));

    return c.json({ contacts: contactsWithOwners, total });
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
      return c.json({ contact: mapRow(result.contact), matchedOn: result.matchedOn });
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
    return c.json({ contact: { ...mapRow(contact), owners } });
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
          existingContact: mapRow(dup.contact),
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

    return c.json({ contact: mapRow(contact) }, 201);
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

    const contact = await repo.update(id, parsed.data);

    // Auto-sync: when category changes, propagate to company + all sibling contacts
    if (parsed.data.category && contact.company_id) {
      await companiesRepo.update(contact.company_id, { category: parsed.data.category });
      await repo.updateCategoryByCompanyId(contact.company_id, parsed.data.category);
      console.log(`[contacts] Synced category "${parsed.data.category}" to company ${contact.company_id} + siblings`);
    }

    // Trigger Pass 2 LinkedIn enrichment when category changes to high-value
    if (
      parsed.data.category &&
      shouldEnrichForCategory(parsed.data.category) &&
      !contact.linkedin_url
    ) {
      const canvasClient = createCanvasClient(config);
      const anthropic = createBedrockClient(config);
      if (canvasClient && anthropic) {
        enrichContactLinkedin(contact.id, {
          contacts: repo,
          companies: companiesRepo,
          dedupCandidates: dedupCandidates!,
          canvas: canvasClient,
          anthropic,
          autoMerge: (keepId, mergeId) => mergeContacts(keepId, mergeId, {
            contacts: repo,
            emails,
            linkedinMessages,
            dedupCandidates,
          }),
        }).catch((err) => {
          console.error(`[contacts] LinkedIn enrichment failed for ${contact.name}:`, err);
        });
      }
    }

    return c.json({ contact: mapRow(contact) });
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

  // POST /:id/enrich-linkedin — trigger LinkedIn enrichment for a single contact
  routes.post("/:id/enrich-linkedin", async (c) => {
    const id = c.req.param("id");
    const contact = await repo.findById(id);
    if (!contact) {
      return c.json({ error: { code: "NOT_FOUND", message: "Contact not found" } }, 404);
    }
    if (contact.linkedin_url) {
      return c.json({ contact: mapRow(contact), alreadyHasLinkedin: true });
    }

    const canvasClient = createCanvasClient(config);
    const anthropic = createBedrockClient(config);
    console.log(`[enrich-linkedin] canvasClient=${!!canvasClient}, anthropic=${!!anthropic}, CANVAS_API_URL=${config.CANVAS_API_URL ?? "not set"}`);
    if (!canvasClient || !anthropic) {
      return c.json({ error: { code: "CONFIG_ERROR", message: "Search/AI not configured" } }, 400);
    }

    await enrichContactLinkedin(contact.id, {
      contacts: repo,
      companies: companiesRepo,
      dedupCandidates: dedupCandidates!,
      canvas: canvasClient,
      anthropic,
      autoMerge: (keepId, mergeId) => mergeContacts(keepId, mergeId, {
        contacts: repo,
        emails,
        linkedinMessages,
        dedupCandidates,
      }),
    });

    const updated = await repo.findById(id);
    return c.json({ contact: mapRow(updated!), linkedinUrl: updated?.linkedin_url ?? null });
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

  // ── Dedup candidates endpoints ──

  // GET /dedup-candidates/pending — list pending dedup candidates
  routes.get("/dedup-candidates/pending", async (c) => {
    if (!dedupCandidates) return c.json({ candidates: [] });
    const rows = await dedupCandidates.listPending();
    const candidates = rows.map((r) => ({
      id: r.id,
      matchReason: r.match_reason,
      aiConfidence: r.ai_confidence,
      status: r.status,
      createdAt: r.created_at,
      contactA: {
        id: r.contact_a_id,
        name: r.contact_a_name,
        email: r.contact_a_email,
        title: r.contact_a_title,
        source: r.contact_a_source,
        linkedinUrl: r.contact_a_linkedin_url,
        aiSummary: r.contact_a_ai_summary,
        companyName: r.contact_a_company_name,
      },
      contactB: {
        id: r.contact_b_id,
        name: r.contact_b_name,
        email: r.contact_b_email,
        title: r.contact_b_title,
        source: r.contact_b_source,
        linkedinUrl: r.contact_b_linkedin_url,
        aiSummary: r.contact_b_ai_summary,
        companyName: r.contact_b_company_name,
      },
    }));
    return c.json({ candidates });
  });

  // GET /dedup-candidates/count — count pending dedup candidates (for sidebar badge)
  routes.get("/dedup-candidates/count", async (c) => {
    if (!dedupCandidates) return c.json({ count: 0 });
    const count = await dedupCandidates.countPending();
    return c.json({ count });
  });

  // GET /dedup-candidates/contact-ids — contact IDs with pending dedup candidates
  routes.get("/dedup-candidates/contact-ids", async (c) => {
    if (!dedupCandidates) return c.json({ contactIds: [] });
    const contactIds = await dedupCandidates.contactIdsWithPending();
    return c.json({ contactIds });
  });

  // POST /dedup-candidates/:id/dismiss — dismiss a dedup candidate
  routes.post("/dedup-candidates/:id/dismiss", async (c) => {
    if (!dedupCandidates) {
      return c.json({ error: { code: "NOT_CONFIGURED", message: "Dedup candidates not configured" } }, 500);
    }
    const id = c.req.param("id");
    try {
      const candidate = await dedupCandidates.resolve(id, "dismissed");
      return c.json({ candidate });
    } catch {
      return c.json({ error: { code: "NOT_FOUND", message: "Dedup candidate not found" } }, 404);
    }
  });

  // ── Contact merge endpoint ──

  // POST /merge — merge two contacts
  routes.post("/merge", async (c) => {
    const body = await c.req.json();
    const { keepContactId, mergeContactId } = body;

    if (!keepContactId || !mergeContactId) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "keepContactId and mergeContactId are required" } },
        400,
      );
    }

    const keepContact = await repo.findById(keepContactId);
    const mergeContact = await repo.findById(mergeContactId);

    if (!keepContact || !mergeContact) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "One or both contacts not found" } },
        404,
      );
    }

    await mergeContacts(keepContactId, mergeContactId, {
      contacts: repo,
      emails,
      linkedinMessages,
      dedupCandidates,
    });

    const updatedContact = await repo.findById(keepContactId);
    return c.json({ contact: updatedContact ? mapRow(updatedContact) : null });
  });

  return routes;
}
