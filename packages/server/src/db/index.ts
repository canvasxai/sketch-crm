/**
 * Database connection factory using Kysely with PostgreSQL.
 */
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Config } from "../config.js";
import type { DB } from "./schema.js";

export function createDatabase(config: Config): Kysely<DB> {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });
}
