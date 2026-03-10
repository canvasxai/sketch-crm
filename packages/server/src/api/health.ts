import { Hono } from "hono";
import { sql, type Kysely } from "kysely";
import type { DB } from "../db/schema.js";

export function healthRoutes(db: Kysely<DB>) {
  const routes = new Hono();

  routes.get("/", async (c) => {
    try {
      await sql`SELECT 1`.execute(db);
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "error", message: "Database connection failed" }, 503);
    }
  });

  return routes;
}
