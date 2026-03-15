import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createCompaniesRepository(db: Kysely<DB>) {
  return {
    async list(opts?: { limit?: number; offset?: number; search?: string; category?: string }) {
      let query = db.selectFrom("companies").selectAll().orderBy("created_at", "desc");

      if (opts?.search) {
        query = query.where("name", "ilike", `%${opts.search}%`);
      }
      if (opts?.category !== undefined) {
        query = query.where("category", "=", opts.category);
      }

      if (opts?.limit !== undefined) {
        query = query.limit(opts.limit);
      }

      if (opts?.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      return query.execute();
    },

    async count(opts?: { search?: string }) {
      let query = db
        .selectFrom("companies")
        .select(db.fn.countAll().as("count"));

      if (opts?.search) {
        query = query.where("name", "ilike", `%${opts.search}%`);
      }

      const result = await query.executeTakeFirstOrThrow();
      return Number(result.count);
    },

    async findById(id: string) {
      return db
        .selectFrom("companies")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findByDomain(domain: string) {
      return db
        .selectFrom("companies")
        .selectAll()
        .where("domain", "=", domain.toLowerCase())
        .executeTakeFirst();
    },

    async search(term: string, limit = 20) {
      return db
        .selectFrom("companies")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("name", "ilike", `%${term}%`),
            eb("domain", "ilike", `%${term}%`),
          ]),
        )
        .orderBy("name", "asc")
        .limit(limit)
        .execute();
    },

    async create(data: {
      name: string;
      domain?: string;
      industry?: string;
      size?: string;
      location?: string;
      websiteUrl?: string;
      linkedinUrl?: string;
      source?: string;
      description?: string;
      techStack?: string;
      fundingStage?: string;
      category?: string;
    }) {
      return db
        .insertInto("companies")
        .values({
          name: data.name,
          domain: data.domain ?? null,
          industry: data.industry ?? null,
          size: data.size ?? null,
          location: data.location ?? null,
          website_url: data.websiteUrl ?? null,
          linkedin_url: data.linkedinUrl ?? null,
          source: data.source ?? null,
          description: data.description ?? null,
          tech_stack: data.techStack ?? null,
          funding_stage: data.fundingStage ?? null,
          ...(data.category !== undefined ? { category: data.category } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        name: string;
        domain: string | null;
        industry: string | null;
        size: string | null;
        location: string | null;
        websiteUrl: string | null;
        linkedinUrl: string | null;
        source: string | null;
        description: string | null;
        techStack: string | null;
        fundingStage: string | null;
        category: string;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.name !== undefined) values.name = data.name;
      if (data.domain !== undefined) values.domain = data.domain;
      if (data.industry !== undefined) values.industry = data.industry;
      if (data.size !== undefined) values.size = data.size;
      if (data.location !== undefined) values.location = data.location;
      if (data.websiteUrl !== undefined) values.website_url = data.websiteUrl;
      if (data.linkedinUrl !== undefined) values.linkedin_url = data.linkedinUrl;
      if (data.source !== undefined) values.source = data.source;
      if (data.description !== undefined) values.description = data.description;
      if (data.techStack !== undefined) values.tech_stack = data.techStack;
      if (data.fundingStage !== undefined) values.funding_stage = data.fundingStage;
      if (data.category !== undefined) values.category = data.category;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("companies")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("companies")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async remove(id: string) {
      return db
        .deleteFrom("companies")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async findOrCreateByDomain(
      domain: string,
      defaults: { name: string; source: string },
    ) {
      const normalizedDomain = domain.toLowerCase();

      const existing = await db
        .selectFrom("companies")
        .selectAll()
        .where("domain", "=", normalizedDomain)
        .executeTakeFirst();

      if (existing) return existing;

      return db
        .insertInto("companies")
        .values({
          name: defaults.name,
          domain: normalizedDomain,
          source: defaults.source,
        })
        .onConflict((oc) => oc.column("domain").doNothing())
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async addOwner(companyId: string, userId: string) {
      return db
        .insertInto("company_owners")
        .values({ company_id: companyId, user_id: userId })
        .onConflict((oc) =>
          oc.columns(["company_id", "user_id"]).doNothing(),
        )
        .returningAll()
        .executeTakeFirst();
    },

    async removeOwner(companyId: string, userId: string) {
      return db
        .deleteFrom("company_owners")
        .where("company_id", "=", companyId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async getOwners(companyId: string) {
      return db
        .selectFrom("company_owners")
        .innerJoin("users", "users.id", "company_owners.user_id")
        .selectAll("users")
        .where("company_owners.company_id", "=", companyId)
        .orderBy("company_owners.created_at", "asc")
        .execute();
    },
  };
}
