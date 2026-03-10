/**
 * Google OAuth 2.0 helpers.
 *
 * Handles the full server-side OAuth flow:
 *   1. Build the consent URL to redirect users to Google.
 *   2. Exchange the authorization code for tokens.
 *   3. Verify the returned ID token and extract user info.
 *
 * Uses the built-in fetch() API -- no external HTTP dependencies.
 */

import type { Config } from "../config.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface GoogleUser {
  email: string;
  name: string;
  googleId: string;
  avatarUrl: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface GoogleTokenInfoPayload {
  iss: string;
  sub: string;
  aud: string;
  email: string;
  email_verified: string;
  name?: string;
  picture?: string;
  exp: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

const SCOPES = [
  "openid",
  "email",
  "profile",
  // Gmail
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  // Calendar
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Builds the Google OAuth consent URL that the client should redirect to.
 */
export function getGoogleAuthUrl(config: Config): string {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for Google OAuth tokens.
 *
 * Returns the full token response including `id_token` and `access_token`.
 * Throws on network or API errors.
 */
export async function exchangeCodeForTokens(
  code: string,
  config: Config,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.GOOGLE_CLIENT_ID,
    client_secret: config.GOOGLE_CLIENT_SECRET,
    redirect_uri: config.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google token exchange failed (${res.status}): ${text}`,
    );
  }

  return (await res.json()) as GoogleTokenResponse;
}

/**
 * Verifies a Google ID token and extracts user information.
 *
 * Uses Google's tokeninfo endpoint for verification which handles
 * signature validation, expiry checks, and audience verification.
 *
 * Returns `null` if verification fails or required fields are missing.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  config: Config,
): Promise<GoogleUser | null> {
  try {
    const res = await fetch(
      `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`,
    );

    if (!res.ok) return null;

    const payload = (await res.json()) as GoogleTokenInfoPayload;

    // Verify the token was issued for our application
    if (payload.aud !== config.GOOGLE_CLIENT_ID) return null;

    // Email is required for our auth flow
    if (!payload.email) return null;

    return {
      email: payload.email,
      name: payload.name ?? payload.email.split("@")[0],
      googleId: payload.sub,
      avatarUrl: payload.picture ?? null,
    };
  } catch {
    return null;
  }
}
