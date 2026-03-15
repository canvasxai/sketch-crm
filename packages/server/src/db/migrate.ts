/**
 * Migration runner — applies database migrations on startup.
 * Uses static imports so it works with bundlers (tsdown).
 */
import { Migrator } from "kysely";
import type { Kysely } from "kysely";
import * as m001 from "./migrations/001-initial.js";
import * as m002 from "./migrations/002-gmail-integration.js";
import * as m003 from "./migrations/003-contacts-visibility-org-settings.js";
import * as m004 from "./migrations/004-sync-frequency.js";
import * as m005 from "./migrations/005-sync-period.js";
import * as m006 from "./migrations/006-vendor-domains.js";
import * as m007 from "./migrations/007-tasks-multi-contact-fields.js";
import * as m008 from "./migrations/008-ingestion-improvements.js";
import * as m009 from "./migrations/009-aimfox-integration.js";
import * as m010 from "./migrations/010-email-body-html.js";
import * as m011 from "./migrations/011-pipeline-opportunities.js";
import * as m012 from "./migrations/012-dedup-and-classification.js";
import * as m013 from "./migrations/013-classification-logs-and-flags.js";
import * as m014 from "./migrations/014-contact-ai-confidence.js";
import * as m015 from "./migrations/015-linkedin-enrichment.js";
import * as m016 from "./migrations/016-dedup-checked-at.js";
import * as m017 from "./migrations/017-decision-maker.js";
import * as m018 from "./migrations/018-rename-pipeline-to-category.js";
import * as m019 from "./migrations/019-gmail-date-range.js";
import * as m020 from "./migrations/020-fireflies-integration.js";
import * as m021 from "./migrations/021-action-generator.js";
import * as m022 from "./migrations/022-fireflies-sync-frequency.js";
import type { DB } from "./schema.js";

export async function runMigrations(db: Kysely<DB>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return {
          "001-initial": m001,
          "002-gmail-integration": m002,
          "003-contacts-visibility-org-settings": m003,
          "004-sync-frequency": m004,
          "005-sync-period": m005,
          "006-vendor-domains": m006,
          "007-tasks-multi-contact-fields": m007,
          "008-ingestion-improvements": m008,
          "009-aimfox-integration": m009,
          "010-email-body-html": m010,
          "011-pipeline-opportunities": m011,
          "012-dedup-and-classification": m012,
          "013-classification-logs-and-flags": m013,
          "014-contact-ai-confidence": m014,
          "015-linkedin-enrichment": m015,
          "016-dedup-checked-at": m016,
          "017-decision-maker": m017,
          "018-rename-pipeline-to-category": m018,
          "019-gmail-date-range": m019,
          "020-fireflies-integration": m020,
          "021-action-generator": m021,
          "022-fireflies-sync-frequency": m022,
        };
      },
    },
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === "Success") {
      console.log(`Migration applied: ${result.migrationName}`);
    } else if (result.status === "Error") {
      console.error(`Migration failed: ${result.migrationName}`);
    }
  }

  if (error) {
    console.error("Migration run failed:", error);
    process.exit(1);
  }
}
