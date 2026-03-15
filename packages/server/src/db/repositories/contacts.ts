import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";
import { areNamesCompatible } from "../../lib/dedup.js";

export interface ContactFilters {
  category?: string;
  source?: string;
  companyId?: string;
  ownerId?: string;
  isCanvasUser?: boolean;
  isSketchUser?: boolean;
  usesServices?: boolean;
  isDecisionMaker?: boolean;
  visibility?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /** Current user ID — used for visibility filtering */
  currentUserId?: string;
}

export function createContactsRepository(db: Kysely<DB>) {
  function applyFilters<T extends { where: any; innerJoin: any }>(
    query: any,
    filters: ContactFilters,
    { needsOwnerJoin }: { needsOwnerJoin: boolean } = { needsOwnerJoin: true },
  ) {
    if (filters.category !== undefined) {
      query = query.where("contacts.category", "=", filters.category);
    }
    if (filters.source !== undefined) {
      query = query.where("contacts.source", "=", filters.source);
    }
    if (filters.companyId !== undefined) {
      query = query.where("contacts.company_id", "=", filters.companyId);
    }
    if (filters.isCanvasUser !== undefined) {
      query = query.where("contacts.is_canvas_user", "=", filters.isCanvasUser);
    }
    if (filters.isSketchUser !== undefined) {
      query = query.where("contacts.is_sketch_user", "=", filters.isSketchUser);
    }
    if (filters.usesServices !== undefined) {
      query = query.where("contacts.uses_services", "=", filters.usesServices);
    }
    if (filters.isDecisionMaker !== undefined) {
      query = query.where("contacts.is_decision_maker", "=", filters.isDecisionMaker);
    }
    if (filters.visibility !== undefined) {
      query = query.where("contacts.visibility", "=", filters.visibility);
    }
    if (filters.search) {
      query = query
        .leftJoin("companies as search_co", "search_co.id", "contacts.company_id")
        .where((eb: any) =>
          eb.or([
            eb("contacts.name", "ilike", `%${filters.search}%`),
            eb("contacts.email", "ilike", `%${filters.search}%`),
            eb("contacts.title", "ilike", `%${filters.search}%`),
            eb("search_co.name", "ilike", `%${filters.search}%`),
          ]),
        );
    }
    if (filters.ownerId !== undefined && needsOwnerJoin) {
      query = query
        .innerJoin("contact_owners", "contact_owners.contact_id", "contacts.id")
        .where("contact_owners.user_id", "=", filters.ownerId);
    }

    // Visibility: shared contacts visible to everyone, private/unreviewed only to creator
    // Contacts with no creator (e.g. from automated sync) are visible to everyone
    if (filters.currentUserId) {
      query = query.where((eb: any) =>
        eb.or([
          eb("contacts.visibility", "=", "shared"),
          eb("contacts.created_by_user_id", "=", filters.currentUserId),
          eb("contacts.created_by_user_id", "is", null),
        ]),
      );
    } else {
      // No authenticated user — only show shared + unowned contacts
      query = query.where((eb: any) =>
        eb.or([
          eb("contacts.visibility", "=", "shared"),
          eb("contacts.created_by_user_id", "is", null),
        ]),
      );
    }

    return query;
  }

  return {
    async list(filters: ContactFilters = {}) {
      let query = db
        .selectFrom("contacts")
        .selectAll("contacts")
        .orderBy("contacts.created_at", "desc");

      query = applyFilters(query, filters);

      if (filters.limit !== undefined) {
        query = query.limit(filters.limit);
      }
      if (filters.offset !== undefined) {
        query = query.offset(filters.offset);
      }

      return query.execute();
    },

    async count(filters: ContactFilters = {}) {
      let query = db
        .selectFrom("contacts")
        .select(db.fn.countAll().as("count"));

      query = applyFilters(query, filters);

      const result = await query.executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * Count contacts grouped by source, applying visibility.
     */
    async countBySource(filters: ContactFilters = {}): Promise<Record<string, number>> {
      let query = db
        .selectFrom("contacts")
        .select(["contacts.source", db.fn.countAll().as("count")])
        .groupBy("contacts.source") as any;

      query = applyFilters(query, filters, { needsOwnerJoin: true });

      const rows = await query.execute();
      const result: Record<string, number> = {};
      for (const row of rows as Array<{ source: string; count: string | number }>) {
        result[row.source] = Number(row.count);
      }
      return result;
    },

    /**
     * Count contacts grouped by visibility, applying visibility.
     */
    async countByVisibility(filters: ContactFilters = {}): Promise<Record<string, number>> {
      let query = db
        .selectFrom("contacts")
        .select(["contacts.visibility", db.fn.countAll().as("count")])
        .groupBy("contacts.visibility") as any;

      query = applyFilters(query, filters, { needsOwnerJoin: true });

      const rows = await query.execute();
      const result: Record<string, number> = {};
      for (const row of rows as Array<{ visibility: string; count: string | number }>) {
        result[row.visibility] = Number(row.count);
      }
      return result;
    },

    async findById(id: string) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findByEmail(email: string) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where(sql`lower(email)`, "=", email.toLowerCase())
        .executeTakeFirst();
    },

    async findByLinkedinUrl(linkedinUrl: string) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where(sql`lower(linkedin_url)`, "=", linkedinUrl.toLowerCase())
        .executeTakeFirst();
    },

    async findByAimfoxLeadId(aimfoxLeadId: string) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where("aimfox_lead_id", "=", aimfoxLeadId)
        .executeTakeFirst();
    },

    async findDuplicate(data: { email?: string; linkedinUrl?: string; name?: string; companyDomain?: string }) {
      if (data.email) {
        // Check primary email field
        const contact = await db
          .selectFrom("contacts")
          .selectAll()
          .where(sql`lower(email)`, "=", data.email.toLowerCase())
          .executeTakeFirst();

        if (contact) {
          return { contact, matchedOn: "email" as const };
        }

        // Check JSONB emails array
        const contactByArray = await db
          .selectFrom("contacts")
          .selectAll()
          .where(
            sql<boolean>`emails @> ${sql.lit(JSON.stringify([{ email: data.email.toLowerCase() }]))}::jsonb`,
          )
          .executeTakeFirst();

        if (contactByArray) {
          return { contact: contactByArray, matchedOn: "email_array" as const };
        }
      }

      if (data.linkedinUrl) {
        const contact = await db
          .selectFrom("contacts")
          .selectAll()
          .where(
            sql`lower(linkedin_url)`,
            "=",
            data.linkedinUrl.toLowerCase(),
          )
          .executeTakeFirst();

        if (contact) {
          return { contact, matchedOn: "linkedin_url" as const };
        }
      }

      // Tier 2: Name + company domain match (cross-source dedup)
      if (data.name && data.companyDomain) {
        const candidates = await db
          .selectFrom("contacts")
          .innerJoin("companies", "companies.id", "contacts.company_id")
          .selectAll("contacts")
          .where(sql`lower(companies.domain)`, "=", data.companyDomain.toLowerCase())
          .execute();

        for (const candidate of candidates) {
          if (areNamesCompatible(data.name, candidate.name)) {
            return { contact: candidate, matchedOn: "name_company_domain" as const };
          }
        }
      }

      return null;
    },

    /**
     * Find contacts at companies with a given domain.
     */
    async findByCompanyDomain(companyDomain: string, excludeId?: string) {
      let query = db
        .selectFrom("contacts")
        .innerJoin("companies", "companies.id", "contacts.company_id")
        .selectAll("contacts")
        .where(sql`lower(companies.domain)`, "=", companyDomain.toLowerCase());

      if (excludeId) {
        query = query.where("contacts.id", "!=", excludeId);
      }

      return query.execute();
    },

    async findActionCandidates() {
      return db
        .selectFrom("contacts")
        .select(["id", "name", "email", "title", "company_id", "category", "is_decision_maker"])
        .where((eb) =>
          eb.or([
            eb("category", "in", ["sales", "client"]),
            eb("is_decision_maker", "=", true),
          ]),
        )
        .orderBy("created_at", "asc")
        .execute();
    },

    /**
     * Find unclassified contacts (for AI batch processing).
     */
    async findUnclassified() {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where("needs_classification", "=", true)
        .orderBy("created_at", "asc")
        .execute();
    },

    async countNeedsClassification() {
      const result = await db
        .selectFrom("contacts")
        .select(db.fn.countAll().as("count"))
        .where("needs_classification", "=", true)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    async setNeedsClassification(ids: string[]) {
      if (ids.length === 0) return;
      await db
        .updateTable("contacts")
        .set({ needs_classification: true })
        .where("id", "in", ids)
        .where("ai_classified_at", "is", null)
        .execute();
    },

    /**
     * Update AI classification fields on a contact.
     */
    async clearNeedsClassification(ids: string[]) {
      if (ids.length === 0) return;
      await db
        .updateTable("contacts")
        .set({ needs_classification: false })
        .where("id", "in", ids)
        .execute();
    },

    async updateClassification(id: string, data: { aiSummary: string | null; category?: string; aiConfidence?: string | null; isDecisionMaker?: boolean }) {
      const values: Record<string, unknown> = {
        ai_summary: data.aiSummary,
        ai_classified_at: sql`now()`,
        needs_classification: false,
      };
      if (data.category !== undefined) {
        values.category = data.category;
      }
      if (data.aiConfidence !== undefined) {
        values.ai_confidence = data.aiConfidence;
      }
      if (data.isDecisionMaker !== undefined) {
        values.is_decision_maker = data.isDecisionMaker;
      }

      return db
        .updateTable("contacts")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Find contacts with similar names using trigram similarity.
     * Used as candidates for AI-powered dedup.
     */
    async findByNameSimilarity(name: string, excludeEmail: string, limit = 5) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where(sql`similarity(name, ${name})`, ">", sql.lit(0.3))
        .where(sql`lower(email)`, "!=", excludeEmail.toLowerCase())
        .orderBy(sql`similarity(name, ${name})`, "desc")
        .limit(limit)
        .execute();
    },

    /**
     * Append an email to a contact's emails JSONB array if not already present.
     */
    async appendEmail(
      contactId: string,
      emailEntry: { email: string; type: string; isPrimary: boolean },
    ) {
      const normalized = { ...emailEntry, email: emailEntry.email.toLowerCase() };
      return db
        .updateTable("contacts")
        .set({
          emails: sql`emails || ${sql.lit(JSON.stringify([normalized]))}::jsonb`,
        })
        .where("id", "=", contactId)
        .where(
          sql<boolean>`NOT (emails @> ${sql.lit(JSON.stringify([{ email: normalized.email }]))}::jsonb)`,
        )
        .returningAll()
        .executeTakeFirst();
    },

    async create(data: {
      name: string;
      email?: string;
      phone?: string;
      title?: string;
      linkedinUrl?: string;
      companyId?: string;
      source: string;
      category?: string;
      isCanvasUser?: boolean;
      isSketchUser?: boolean;
      usesServices?: boolean;
      isDecisionMaker?: boolean;
      canvasSignupDate?: string;
      visibility?: string;
      createdByUserId?: string;
      leadChannel?: string | null;
      emails?: Array<{ email: string; type: string; isPrimary: boolean }>;
      phones?: Array<{ phone: string; type: string; isPrimary: boolean }>;
      aimfoxLeadId?: string;
      aimfoxProfileData?: unknown;
    }) {
      return db
        .insertInto("contacts")
        .values({
          name: data.name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          title: data.title ?? null,
          linkedin_url: data.linkedinUrl ?? null,
          company_id: data.companyId ?? null,
          source: data.source,
          needs_classification: true,
          ...(data.category !== undefined
            ? { category: data.category }
            : {}),
          ...(data.isCanvasUser !== undefined
            ? { is_canvas_user: data.isCanvasUser }
            : {}),
          ...(data.isSketchUser !== undefined
            ? { is_sketch_user: data.isSketchUser }
            : {}),
          ...(data.usesServices !== undefined
            ? { uses_services: data.usesServices }
            : {}),
          ...(data.isDecisionMaker !== undefined
            ? { is_decision_maker: data.isDecisionMaker }
            : {}),
          canvas_signup_date: data.canvasSignupDate ?? null,
          ...(data.visibility !== undefined
            ? { visibility: data.visibility }
            : {}),
          created_by_user_id: data.createdByUserId ?? null,
          lead_channel: data.leadChannel ?? null,
          ...(data.emails !== undefined
            ? { emails: JSON.stringify(data.emails) }
            : {}),
          ...(data.phones !== undefined
            ? { phones: JSON.stringify(data.phones) }
            : {}),
          aimfox_lead_id: data.aimfoxLeadId ?? null,
          ...(data.aimfoxProfileData !== undefined
            ? { aimfox_profile_data: JSON.stringify(data.aimfoxProfileData) }
            : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        name: string;
        email: string | null;
        phone: string | null;
        title: string | null;
        linkedinUrl: string | null;
        companyId: string | null;
        source: string;
        category: string;
        isCanvasUser: boolean;
        isSketchUser: boolean;
        usesServices: boolean;
        isDecisionMaker: boolean;
        canvasSignupDate: string | null;
        visibility: string;
        leadChannel: string | null;
        emails: Array<{ email: string; type: string; isPrimary: boolean }>;
        phones: Array<{ phone: string; type: string; isPrimary: boolean }>;
        aimfoxLeadId: string | null;
        aimfoxProfileData: unknown | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.name !== undefined) values.name = data.name;
      if (data.email !== undefined) values.email = data.email;
      if (data.phone !== undefined) values.phone = data.phone;
      if (data.title !== undefined) values.title = data.title;
      if (data.linkedinUrl !== undefined) values.linkedin_url = data.linkedinUrl;
      if (data.companyId !== undefined) values.company_id = data.companyId;
      if (data.source !== undefined) values.source = data.source;
      if (data.category !== undefined) values.category = data.category;
      if (data.isCanvasUser !== undefined) values.is_canvas_user = data.isCanvasUser;
      if (data.isSketchUser !== undefined) values.is_sketch_user = data.isSketchUser;
      if (data.usesServices !== undefined) values.uses_services = data.usesServices;
      if (data.isDecisionMaker !== undefined) values.is_decision_maker = data.isDecisionMaker;
      if (data.canvasSignupDate !== undefined) values.canvas_signup_date = data.canvasSignupDate;
      if (data.visibility !== undefined) values.visibility = data.visibility;
      if (data.leadChannel !== undefined) values.lead_channel = data.leadChannel;
      if (data.emails !== undefined) values.emails = JSON.stringify(data.emails);
      if (data.phones !== undefined) values.phones = JSON.stringify(data.phones);
      if (data.aimfoxLeadId !== undefined) values.aimfox_lead_id = data.aimfoxLeadId;
      if (data.aimfoxProfileData !== undefined) values.aimfox_profile_data = data.aimfoxProfileData ? JSON.stringify(data.aimfoxProfileData) : null;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("contacts")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("contacts")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Batch update visibility for multiple contacts.
     */
    async batchUpdateVisibility(ids: string[], visibility: string) {
      if (ids.length === 0) return 0;

      const result = await db
        .updateTable("contacts")
        .set({ visibility })
        .where("id", "in", ids)
        .execute();

      return result.length > 0 ? Number(result[0].numUpdatedRows) : 0;
    },

    /**
     * Update category for all contacts belonging to a company.
     */
    async updateCategoryByCompanyId(companyId: string, category: string) {
      const result = await db
        .updateTable("contacts")
        .set({ category })
        .where("company_id", "=", companyId)
        .execute();

      return result.length > 0 ? Number(result[0].numUpdatedRows) : 0;
    },

    /**
     * Batch delete contacts by IDs. Emails cascade-delete via FK.
     */
    async batchDelete(ids: string[]) {
      if (ids.length === 0) return 0;

      const result = await db
        .deleteFrom("contacts")
        .where("id", "in", ids)
        .execute();

      return result.length > 0 ? Number(result[0].numDeletedRows) : 0;
    },

    /** Transfer all related records from one contact to another. */
    async transferRelatedRecords(fromContactId: string, toContactId: string) {
      const tables = ["meetings", "tasks", "notes", "opportunities", "linkedin_messages", "emails"] as const;
      for (const table of tables) {
        await sql`UPDATE ${sql.table(table)} SET contact_id = ${toContactId} WHERE contact_id = ${fromContactId}`.execute(db);
      }
    },

    async remove(id: string) {
      return db
        .deleteFrom("contacts")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async addOwner(contactId: string, userId: string) {
      return db
        .insertInto("contact_owners")
        .values({ contact_id: contactId, user_id: userId })
        .onConflict((oc) =>
          oc.columns(["contact_id", "user_id"]).doNothing(),
        )
        .returningAll()
        .executeTakeFirst();
    },

    async removeOwner(contactId: string, userId: string) {
      return db
        .deleteFrom("contact_owners")
        .where("contact_id", "=", contactId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Get the most recent created_at per source (for sync status display).
     */
    async latestBySource(): Promise<Record<string, string>> {
      const rows = await db
        .selectFrom("contacts")
        .select(["source", sql<string>`max(created_at)`.as("latest")])
        .groupBy("source")
        .execute();
      const result: Record<string, string> = {};
      for (const row of rows as Array<{ source: string; latest: string }>) {
        result[row.source] = row.latest;
      }
      return result;
    },

    async getOwners(contactId: string) {
      return db
        .selectFrom("contact_owners")
        .innerJoin("users", "users.id", "contact_owners.user_id")
        .selectAll("users")
        .where("contact_owners.contact_id", "=", contactId)
        .orderBy("contact_owners.created_at", "asc")
        .execute();
    },

    /**
     * Batch-fetch owners for a list of contacts (avoids N+1).
     * Returns a map of contactId → owner array.
     */
    async getOwnersBatch(contactIds: string[]) {
      if (contactIds.length === 0) return {} as Record<string, Array<{ id: string; name: string; avatarUrl: string | null }>>;

      const rows = await db
        .selectFrom("contact_owners")
        .innerJoin("users", "users.id", "contact_owners.user_id")
        .select([
          "contact_owners.contact_id",
          "users.id",
          "users.name",
          "users.avatar_url",
        ])
        .where("contact_owners.contact_id", "in", contactIds)
        .orderBy("contact_owners.created_at", "asc")
        .execute();

      const result: Record<string, Array<{ id: string; name: string; avatarUrl: string | null }>> = {};
      for (const row of rows) {
        if (!result[row.contact_id]) result[row.contact_id] = [];
        result[row.contact_id].push({
          id: row.id,
          name: row.name,
          avatarUrl: row.avatar_url,
        });
      }
      return result;
    },

    /**
     * Find contacts that have an email and company but no LinkedIn URL,
     * and haven't been checked for LinkedIn enrichment yet.
     */
    async findUnenrichedGmailContacts(limit = 50) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where("email", "is not", null)
        .where("linkedin_url", "is", null)
        .where("linkedin_enriched_at", "is", null)
        .where("company_id", "is not", null)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
    },

    /**
     * Mark a contact as having been checked for LinkedIn enrichment.
     */
    async markLinkedinEnriched(id: string) {
      return db
        .updateTable("contacts")
        .set({ linkedin_enriched_at: new Date().toISOString() })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Find contacts that haven't been checked for Tier 3 (fuzzy name) dedup yet.
     */
    async findNeedsDedupCheck(limit = 200) {
      return db
        .selectFrom("contacts")
        .selectAll()
        .where("dedup_checked_at", "is", null)
        .where("name", "is not", null)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
    },

    /**
     * Mark a contact as having been checked for Tier 3 dedup.
     */
    async markDedupChecked(id: string) {
      return db
        .updateTable("contacts")
        .set({ dedup_checked_at: new Date().toISOString() })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Find contacts that need human review:
     * - ai_confidence = 'low' (low confidence classification)
     * - ai_classified_at IS NOT NULL AND pipeline IS NULL (classified but uncategorized)
     * Excludes contacts already confirmed by a human (ai_confidence = 'confirmed').
     */
    async findNeedsReview(limit = 50, offset = 0) {
      return db
        .selectFrom("contacts")
        .leftJoin("companies", "companies.id", "contacts.company_id")
        .select([
          "contacts.id",
          "contacts.name",
          "contacts.email",
          "contacts.title",
          "contacts.linkedin_url",
          "contacts.company_id",
          "contacts.source",
          "contacts.category",
          "contacts.ai_confidence",
          "contacts.ai_summary",
          "contacts.ai_classified_at",
          "contacts.needs_classification",
          "contacts.created_at",
          "contacts.updated_at",
          "companies.name as company_name",
        ])
        .where((eb) =>
          eb.or([
            eb("contacts.ai_confidence", "=", "low"),
            eb.and([
              eb("contacts.ai_classified_at", "is not", null),
              eb("contacts.category", "=", "uncategorized"),
            ]),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb("contacts.ai_confidence", "is", null),
            eb("contacts.ai_confidence", "!=", "confirmed"),
          ]),
        )
        .orderBy("contacts.created_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
    },

    async countNeedsReview() {
      const result = await db
        .selectFrom("contacts")
        .select(db.fn.countAll().as("count"))
        .where((eb) =>
          eb.or([
            eb("ai_confidence", "=", "low"),
            eb.and([
              eb("ai_classified_at", "is not", null),
              eb("category", "=", "uncategorized"),
            ]),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb("ai_confidence", "is", null),
            eb("ai_confidence", "!=", "confirmed"),
          ]),
        )
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * Confirm a contact's classification — sets pipeline and marks as human-confirmed.
     */
    async confirmClassification(id: string, category: string) {
      return db
        .updateTable("contacts")
        .set({
          category,
          ai_confidence: "confirmed",
          needs_classification: false,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
