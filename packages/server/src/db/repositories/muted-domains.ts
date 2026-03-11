import { type Kysely, sql } from "kysely";
import type { DB } from "../schema.js";

export interface MutedDomain {
  id: string;
  domain: string;
  source: string;
  created_at: string;
}

export function createMutedDomainsRepository(db: Kysely<DB>) {
  return {
    /**
     * List all muted domains, ordered by domain name.
     */
    async list(): Promise<MutedDomain[]> {
      return db
        .selectFrom("muted_domains")
        .select(["id", "domain", "source", "created_at"])
        .orderBy("domain", "asc")
        .execute();
    },

    /**
     * Get just the domain strings (used by gmail-sync for filtering).
     */
    async getDomainList(): Promise<string[]> {
      const rows = await db.selectFrom("muted_domains").select("domain").execute();
      return rows.map((r) => r.domain);
    },

    /**
     * Add a muted domain. Returns the created record.
     * Normalizes to lowercase. Skips if already exists.
     */
    async add(domain: string, source: "manual" | "ai" = "manual"): Promise<MutedDomain | null> {
      const normalized = domain.toLowerCase().trim();
      if (!normalized) return null;

      const result = await db
        .insertInto("muted_domains")
        .values({ domain: normalized, source })
        .onConflict((oc) => oc.column("domain").doNothing())
        .returning(["id", "domain", "source", "created_at"])
        .executeTakeFirst();

      return result ?? null;
    },

    /**
     * Remove a muted domain by ID.
     */
    async remove(id: string): Promise<boolean> {
      const result = await db.deleteFrom("muted_domains").where("id", "=", id).executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Remove a muted domain by domain string.
     */
    async removeByDomain(domain: string): Promise<boolean> {
      const result = await db
        .deleteFrom("muted_domains")
        .where("domain", "=", domain.toLowerCase().trim())
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Retroactively purge contacts and companies matching a domain.
     * Contacts whose email ends with @domain are deleted (cascade deletes their emails, notes, etc.).
     * Companies whose domain field matches are deleted if they have no remaining contacts.
     * Returns counts of what was removed.
     */
    async purgeByDomain(domain: string): Promise<{ contactsRemoved: number; companiesRemoved: number }> {
      const normalized = domain.toLowerCase().trim();
      const emailSuffix = `@${normalized}`;

      // Delete contacts with emails from this domain
      const contactResult = await db
        .deleteFrom("contacts")
        .where("email", "like", `%${emailSuffix}`)
        .executeTakeFirst();
      const contactsRemoved = Number(contactResult.numDeletedRows ?? 0n);

      // Delete companies with this domain that now have zero contacts
      const companiesResult = await db
        .deleteFrom("companies")
        .where("domain", "=", normalized)
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("contacts").select(sql`1`.as("one")).whereRef("contacts.company_id", "=", "companies.id"),
            ),
          ),
        )
        .executeTakeFirst();
      const companiesRemoved = Number(companiesResult.numDeletedRows ?? 0n);

      return { contactsRemoved, companiesRemoved };
    },
  };
}
