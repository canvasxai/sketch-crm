import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createOrgSettingsRepository(db: Kysely<DB>) {
  return {
    /**
     * Get the list of internal company domains.
     */
    async getInternalDomains(): Promise<string[]> {
      const row = await db
        .selectFrom("org_settings")
        .select("value")
        .where("key", "=", "internal_domains")
        .executeTakeFirst();

      if (!row) return [];
      return (row.value as string[]) ?? [];
    },

    /**
     * Set the list of internal company domains.
     * Normalizes to lowercase and deduplicates.
     */
    async setInternalDomains(domains: string[]): Promise<string[]> {
      const normalized = [...new Set(domains.map((d) => d.toLowerCase().trim()).filter(Boolean))];

      await db
        .insertInto("org_settings")
        .values({
          key: "internal_domains",
          value: JSON.stringify(normalized),
        })
        .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(normalized) }))
        .execute();

      return normalized;
    },
  };
}
