import { sql, type Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createDedupCandidatesRepository(db: Kysely<DB>) {
  return {
    async create(data: {
      contactIdA: string;
      contactIdB: string;
      matchReason: string;
      aiConfidence?: string;
    }) {
      return db
        .insertInto("dedup_candidates")
        .values({
          contact_id_a: data.contactIdA,
          contact_id_b: data.contactIdB,
          match_reason: data.matchReason,
          ai_confidence: data.aiConfidence ?? null,
        })
        .onConflict((oc) => oc.doNothing()) // unique pair constraint
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * List pending candidates with joined contact details for both sides.
     */
    async listPending(limit = 50) {
      const rows = await db
        .selectFrom("dedup_candidates")
        .innerJoin("contacts as ca", "ca.id", "dedup_candidates.contact_id_a")
        .innerJoin("contacts as cb", "cb.id", "dedup_candidates.contact_id_b")
        .leftJoin("companies as coa", "coa.id", "ca.company_id")
        .leftJoin("companies as cob", "cob.id", "cb.company_id")
        .select([
          "dedup_candidates.id",
          "dedup_candidates.match_reason",
          "dedup_candidates.ai_confidence",
          "dedup_candidates.status",
          "dedup_candidates.created_at",
          // Contact A
          "ca.id as contact_a_id",
          "ca.name as contact_a_name",
          "ca.email as contact_a_email",
          "ca.title as contact_a_title",
          "ca.source as contact_a_source",
          "ca.linkedin_url as contact_a_linkedin_url",
          "ca.ai_summary as contact_a_ai_summary",
          "coa.name as contact_a_company_name",
          // Contact B
          "cb.id as contact_b_id",
          "cb.name as contact_b_name",
          "cb.email as contact_b_email",
          "cb.title as contact_b_title",
          "cb.source as contact_b_source",
          "cb.linkedin_url as contact_b_linkedin_url",
          "cb.ai_summary as contact_b_ai_summary",
          "cob.name as contact_b_company_name",
        ])
        .where("dedup_candidates.status", "=", "pending")
        .orderBy("dedup_candidates.created_at", "desc")
        .limit(limit)
        .execute();

      return rows;
    },

    async countPending() {
      const result = await db
        .selectFrom("dedup_candidates")
        .select(db.fn.countAll().as("count"))
        .where("status", "=", "pending")
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    async resolve(id: string, status: "merged" | "dismissed") {
      return db
        .updateTable("dedup_candidates")
        .set({ status, resolved_at: sql`now()` })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Check if a pair already exists (in either direction).
     */
    async existsPair(contactIdA: string, contactIdB: string) {
      const result = await db
        .selectFrom("dedup_candidates")
        .select("id")
        .where((eb) =>
          eb.or([
            eb.and([
              eb("contact_id_a", "=", contactIdA),
              eb("contact_id_b", "=", contactIdB),
            ]),
            eb.and([
              eb("contact_id_a", "=", contactIdB),
              eb("contact_id_b", "=", contactIdA),
            ]),
          ]),
        )
        .executeTakeFirst();
      return !!result;
    },

    /**
     * Return unique contact IDs that appear in at least one pending dedup candidate.
     */
    async contactIdsWithPending(): Promise<string[]> {
      const rows = await db
        .selectFrom("dedup_candidates")
        .select(["contact_id_a", "contact_id_b"])
        .where("status", "=", "pending")
        .execute();

      const ids = new Set<string>();
      for (const row of rows) {
        ids.add(row.contact_id_a);
        ids.add(row.contact_id_b);
      }
      return [...ids];
    },

    /**
     * Resolve all candidates involving a specific contact (after merge).
     */
    async resolveByContactId(contactId: string, status: "merged" | "dismissed") {
      return db
        .updateTable("dedup_candidates")
        .set({ status, resolved_at: sql`now()` })
        .where("status", "=", "pending")
        .where((eb) =>
          eb.or([
            eb("contact_id_a", "=", contactId),
            eb("contact_id_b", "=", contactId),
          ]),
        )
        .execute();
    },
  };
}
