import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createClassificationLogsRepository(db: Kysely<DB>) {
  return {
    async create(data: {
      contactId: string;
      runId: string;
      pipelineAssigned: string | null;
      previousPipeline: string | null;
      aiSummary: string | null;
      confidence: string | null;
    }) {
      return db
        .insertInto("classification_logs")
        .values({
          contact_id: data.contactId,
          run_id: data.runId,
          pipeline_assigned: data.pipelineAssigned,
          previous_pipeline: data.previousPipeline,
          ai_summary: data.aiSummary,
          confidence: data.confidence,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** Get all logs for a run, with contact + company names for display. */
    async findByRunId(runId: string) {
      return db
        .selectFrom("classification_logs")
        .innerJoin("contacts", "contacts.id", "classification_logs.contact_id")
        .leftJoin("companies", "companies.id", "contacts.company_id")
        .select([
          "classification_logs.id",
          "classification_logs.contact_id",
          "classification_logs.run_id",
          "classification_logs.pipeline_assigned",
          "classification_logs.previous_pipeline",
          "classification_logs.ai_summary",
          "classification_logs.confidence",
          "classification_logs.created_at",
          "contacts.name as contact_name",
          "companies.name as company_name",
        ])
        .where("classification_logs.run_id", "=", runId)
        .orderBy("classification_logs.created_at", "asc")
        .execute();
    },

    /** Get classification history for a single contact. */
    async findByContactId(contactId: string) {
      return db
        .selectFrom("classification_logs")
        .selectAll()
        .where("contact_id", "=", contactId)
        .orderBy("created_at", "desc")
        .execute();
    },
  };
}
