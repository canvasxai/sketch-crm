import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { Config } from "../config.js";
import type { createUsersRepository } from "../db/repositories/users.js";
import { signJwt, verifyJwt } from "../auth/jwt.js";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  verifyGoogleIdToken,
} from "../auth/google.js";

type UsersRepo = ReturnType<typeof createUsersRepository>;

export const SESSION_COOKIE = "crm_session";

const SEVEN_DAYS = 60 * 60 * 24 * 7;

export function authRoutes(repo: UsersRepo, config: Config) {
  const routes = new Hono();

  // Redirect to Google OAuth consent screen
  routes.get("/google", (c) => {
    const url = getGoogleAuthUrl(config);
    return c.redirect(url);
  });

  // Google OAuth callback — exchange code, create/find user, set JWT cookie
  routes.get("/google/callback", async (c) => {
    const code = c.req.query("code");

    if (!code) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Missing authorization code" } },
        400,
      );
    }

    try {
      const tokens = await exchangeCodeForTokens(code, config);
      const googleUser = await verifyGoogleIdToken(tokens.id_token, config);

      if (!googleUser) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Failed to verify Google ID token" } },
          401,
        );
      }

      const user = await repo.findOrCreateByGoogle({
        email: googleUser.email,
        name: googleUser.name,
        googleId: googleUser.googleId,
        avatarUrl: googleUser.avatarUrl ?? undefined,
      });

      // Store OAuth tokens for Gmail API access
      const tokenExpiry = new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString();

      await repo.update(user.id, {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? null,
        googleTokenExpiry: tokenExpiry,
      });

      const token = await signJwt(user.email, config.JWT_SECRET);

      const isProduction = process.env.NODE_ENV === "production";

      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: SEVEN_DAYS,
        secure: isProduction,
      });

      return c.redirect("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth callback failed";
      return c.json(
        { error: { code: "VALIDATION_ERROR", message } },
        500,
      );
    }
  });

  // Logout — clear session cookie
  routes.post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, {
      path: "/",
    });
    return c.json({ success: true });
  });

  // Session check — return current user info if authenticated
  routes.get("/session", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);

    if (!token) {
      return c.json({ authenticated: false });
    }

    const payload = await verifyJwt(token, config.JWT_SECRET);

    if (!payload) {
      return c.json({ authenticated: false });
    }

    const user = await repo.findByEmail(payload.email);

    if (!user) {
      return c.json({ authenticated: false });
    }

    return c.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
        role: user.role,
      },
    });
  });

  return routes;
}
