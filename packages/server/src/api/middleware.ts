import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { Config } from "../config.js";
import { verifyJwt } from "../auth/jwt.js";
import { SESSION_COOKIE } from "./auth.js";

const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/session",
  "/api/integrations/gmail/sync/cron",
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) => path === publicPath || path === `${publicPath}/`,
  );
}

export function authMiddleware(config: Config) {
  return async (c: Context, next: Next) => {
    const path = new URL(c.req.url).pathname;

    // Skip auth for non-API routes and public API paths
    if (!path.startsWith("/api") || isPublicPath(path)) {
      return next();
    }

    const token = getCookie(c, SESSION_COOKIE);

    if (!token) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        401,
      );
    }

    const payload = await verifyJwt(token, config.JWT_SECRET);

    if (!payload) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        401,
      );
    }

    // Attach user email to context for downstream handlers
    c.set("userEmail", payload.email);

    return next();
  };
}
