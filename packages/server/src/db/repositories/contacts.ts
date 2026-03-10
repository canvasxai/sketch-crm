import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export interface ContactFilters {
  funnelStage?: "new" | "qualified" | "opportunity" | "customer" | "dormant" | "lost";
  source?: string;
  companyId?: string;
  ownerId?: string;
  isCanvasUser?: boolean;
  isSketchUser?: boolean;
  usesServices?: boolean;
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
    if (filters.funnelStage !== undefined) {
      query = query.where("contacts.funnel_stage", "=", filters.funnelStage);
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
    if (filters.visibility !== undefined) {
      query = query.where("contacts.visibility", "=", filters.visibility);
    }
    if (filters.search) {
      query = query.where((eb: any) =>
        eb.or([
          eb("contacts.name", "ilike", `%${filters.search}%`),
          eb("contacts.email", "ilike", `%${filters.search}%`),
        ]),
      );
    }
    if (filters.ownerId !== undefined && needsOwnerJoin) {
      query = query
        .innerJoin("contact_owners", "contact_owners.contact_id", "contacts.id")
        .where("contact_owners.user_id", "=", filters.ownerId);
    }

    // Visibility: shared contacts visible to everyone, private/unreviewed only to creator
    if (filters.currentUserId) {
      query = query.where((eb: any) =>
        eb.or([
          eb("contacts.visibility", "=", "shared"),
          eb("contacts.created_by_user_id", "=", filters.currentUserId),
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

    async findDuplicate(data: { email?: string; linkedinUrl?: string }) {
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

      return null;
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
      funnelStage?: string;
      isCanvasUser?: boolean;
      isSketchUser?: boolean;
      usesServices?: boolean;
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
          ...(data.funnelStage !== undefined
            ? { funnel_stage: data.funnelStage }
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
        funnelStage: string;
        isCanvasUser: boolean;
        isSketchUser: boolean;
        usesServices: boolean;
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
      if (data.funnelStage !== undefined) values.funnel_stage = data.funnelStage;
      if (data.isCanvasUser !== undefined) values.is_canvas_user = data.isCanvasUser;
      if (data.isSketchUser !== undefined) values.is_sketch_user = data.isSketchUser;
      if (data.usesServices !== undefined) values.uses_services = data.usesServices;
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
  };
}
