import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export interface OpportunityFilters {
  pipelineId?: string;
  stageId?: string;
  stageType?: string; // 'active' | 'won' | 'lost'
  companyId?: string;
  contactId?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
}

export function createOpportunitiesRepository(db: Kysely<DB>) {
  return {
    /**
     * List opportunities with filters. Joins pipeline_stages for stage info.
     */
    async list(filters: OpportunityFilters = {}) {
      let query = db
        .selectFrom("opportunities")
        .innerJoin("pipeline_stages", "pipeline_stages.id", "opportunities.stage_id")
        .innerJoin("pipelines", "pipelines.id", "opportunities.pipeline_id")
        .leftJoin("companies", "companies.id", "opportunities.company_id")
        .leftJoin("contacts", "contacts.id", "opportunities.contact_id")
        .leftJoin("users", "users.id", "opportunities.owner_id")
        .select([
          "opportunities.id",
          "opportunities.company_id",
          "opportunities.contact_id",
          "opportunities.pipeline_id",
          "opportunities.stage_id",
          "opportunities.title",
          "opportunities.value",
          "opportunities.value_period",
          "opportunities.confidence",
          "opportunities.close_date",
          "opportunities.owner_id",
          "opportunities.notes",
          "opportunities.created_at",
          "opportunities.updated_at",
          "pipeline_stages.label as stage_label",
          "pipeline_stages.stage_type",
          "pipeline_stages.position as stage_position",
          "pipelines.name as pipeline_name",
          "companies.name as company_name",
          "companies.domain as company_domain",
          "contacts.name as contact_name",
          "contacts.email as contact_email",
          "users.name as owner_name",
        ])
        .orderBy("opportunities.created_at", "desc");

      if (filters.pipelineId !== undefined) {
        query = query.where("opportunities.pipeline_id", "=", filters.pipelineId);
      }
      if (filters.stageId !== undefined) {
        query = query.where("opportunities.stage_id", "=", filters.stageId);
      }
      if (filters.stageType !== undefined) {
        query = query.where("pipeline_stages.stage_type", "=", filters.stageType);
      }
      if (filters.companyId !== undefined) {
        query = query.where("opportunities.company_id", "=", filters.companyId);
      }
      if (filters.contactId !== undefined) {
        query = query.where("opportunities.contact_id", "=", filters.contactId);
      }
      if (filters.ownerId !== undefined) {
        query = query.where("opportunities.owner_id", "=", filters.ownerId);
      }
      if (filters.limit !== undefined) {
        query = query.limit(filters.limit);
      }
      if (filters.offset !== undefined) {
        query = query.offset(filters.offset);
      }

      return query.execute();
    },

    /**
     * Count opportunities matching filters.
     */
    async count(filters: OpportunityFilters = {}) {
      let query = db
        .selectFrom("opportunities")
        .innerJoin("pipeline_stages", "pipeline_stages.id", "opportunities.stage_id")
        .select(db.fn.countAll().as("count"));

      if (filters.pipelineId !== undefined) {
        query = query.where("opportunities.pipeline_id", "=", filters.pipelineId);
      }
      if (filters.stageType !== undefined) {
        query = query.where("pipeline_stages.stage_type", "=", filters.stageType);
      }
      if (filters.companyId !== undefined) {
        query = query.where("opportunities.company_id", "=", filters.companyId);
      }
      if (filters.ownerId !== undefined) {
        query = query.where("opportunities.owner_id", "=", filters.ownerId);
      }

      const result = await query.executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * Find a single opportunity by ID with all joins.
     */
    async findById(id: string) {
      return db
        .selectFrom("opportunities")
        .innerJoin("pipeline_stages", "pipeline_stages.id", "opportunities.stage_id")
        .innerJoin("pipelines", "pipelines.id", "opportunities.pipeline_id")
        .leftJoin("companies", "companies.id", "opportunities.company_id")
        .leftJoin("contacts", "contacts.id", "opportunities.contact_id")
        .leftJoin("users", "users.id", "opportunities.owner_id")
        .select([
          "opportunities.id",
          "opportunities.company_id",
          "opportunities.contact_id",
          "opportunities.pipeline_id",
          "opportunities.stage_id",
          "opportunities.title",
          "opportunities.value",
          "opportunities.value_period",
          "opportunities.confidence",
          "opportunities.close_date",
          "opportunities.owner_id",
          "opportunities.notes",
          "opportunities.created_at",
          "opportunities.updated_at",
          "pipeline_stages.label as stage_label",
          "pipeline_stages.stage_type",
          "pipeline_stages.position as stage_position",
          "pipelines.name as pipeline_name",
          "companies.name as company_name",
          "companies.domain as company_domain",
          "contacts.name as contact_name",
          "contacts.email as contact_email",
          "users.name as owner_name",
        ])
        .where("opportunities.id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Create a new opportunity.
     */
    async create(data: {
      companyId?: string;
      contactId?: string;
      pipelineId: string;
      stageId: string;
      title?: string;
      value?: number;
      valuePeriod?: string;
      confidence?: number;
      closeDate?: string;
      ownerId?: string;
      notes?: string;
    }) {
      const opp = await db
        .insertInto("opportunities")
        .values({
          company_id: data.companyId ?? null,
          contact_id: data.contactId ?? null,
          pipeline_id: data.pipelineId,
          stage_id: data.stageId,
          title: data.title ?? null,
          value: data.value ?? null,
          value_period: data.valuePeriod ?? null,
          confidence: data.confidence ?? null,
          close_date: data.closeDate ?? null,
          owner_id: data.ownerId ?? null,
          notes: data.notes ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.findById(opp.id);
    },

    /**
     * Update an opportunity. Returns the updated record with joins.
     */
    async update(
      id: string,
      data: Partial<{
        companyId: string | null;
        contactId: string | null;
        pipelineId: string;
        stageId: string;
        title: string | null;
        value: number | null;
        valuePeriod: string | null;
        confidence: number | null;
        closeDate: string | null;
        ownerId: string | null;
        notes: string | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.companyId !== undefined) values.company_id = data.companyId;
      if (data.contactId !== undefined) values.contact_id = data.contactId;
      if (data.pipelineId !== undefined) values.pipeline_id = data.pipelineId;
      if (data.stageId !== undefined) values.stage_id = data.stageId;
      if (data.title !== undefined) values.title = data.title;
      if (data.value !== undefined) values.value = data.value;
      if (data.valuePeriod !== undefined) values.value_period = data.valuePeriod;
      if (data.confidence !== undefined) values.confidence = data.confidence;
      if (data.closeDate !== undefined) values.close_date = data.closeDate;
      if (data.ownerId !== undefined) values.owner_id = data.ownerId;
      if (data.notes !== undefined) values.notes = data.notes;

      if (Object.keys(values).length === 0) {
        return this.findById(id);
      }

      await db
        .updateTable("opportunities")
        .set(values)
        .where("id", "=", id)
        .execute();

      return this.findById(id);
    },

    /**
     * Delete an opportunity.
     */
    async remove(id: string) {
      return db
        .deleteFrom("opportunities")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
