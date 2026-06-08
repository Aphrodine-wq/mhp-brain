// "Sign in with QuickBooks" (Intuit OpenID Connect) — IDENTITY, not the read-only QuickBooks
// accounting data connection in lib/oauth/. Same trust model as Google/Microsoft sign-in: a
// verified Intuit email signs you in ONLY if it already maps to an active users row. No
// just-in-time account creation, so a random Intuit account can authenticate and still be turned
// away here.
//
// Reuses the same QB_CLIENT_ID / QB_CLIENT_SECRET as the accounting data connection, but with its
// own redirect URI (QB_AUTH_REDIRECT_URI → /api/auth/quickbooks/callback) and identity-only scopes
// (openid email profile). No tokens stored — this is a one-shot identity check, modeled on
// lib/ms-auth.ts (exchange code, then hit the userinfo endpoint for the verified email).

import { randomBytes } from "node:crypto";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
// Intuit serves userinfo from environment-specific hosts. Dev/sandbox keys must use the sandbox
// host or the access token won't resolve. Default to production; flip with QB_ENV=sandbox.
const USERINFO_URL_PROD = "https://accounts.platform.intuit.com/v1/openid_connect/userinfo";
const USERINFO_URL_SANDBOX = "https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo";

// Cheap, throw-free presence check — drives whether the login page shows the QuickBooks button, so
// a missing cred can never render a button that 500s inside cfg().
export function quickbooksAuthConfigured(): boolean {
  return Boolean(
    process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET && process.env.QB_AUTH_REDIRECT_URI,
  );
}

function cfg(): { clientId: string; clientSecret: string; redirectUri: string; userinfoUrl: string } {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = process.env.QB_AUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("QuickBooks login not configured (QB_CLIENT_ID/SECRET/QB_AUTH_REDIRECT_URI).");
  }
  const userinfoUrl = process.env.QB_ENV === "sandbox" ? USERINFO_URL_SANDBOX : USERINFO_URL_PROD;
  return { clientId, clientSecret, redirectUri, userinfoUrl };
}

export function newState(): string {
  return randomBytes(32).toString("hex");
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = cfg();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // openid email profile = identity only. We deliberately do NOT request
    // com.intuit.quickbooks.accounting here — that read-only data scope lives on the separate
    // Integrations connection, not on the login path.
    scope: "openid email profile",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchangeCodeForIdentity(
  code: string,
): Promise<{ email: string; emailVerified: boolean }> {
  const { clientId, clientSecret, redirectUri, userinfoUrl } = cfg();

  // Intuit's token endpoint expects client_secret_basic (creds in the Authorization header).
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`QuickBooks token exchange failed (${res.status})`);
  const tok = (await res.json()) as { access_token?: string; id_token?: string };
  if (!tok.access_token) throw new Error("no access_token in QuickBooks token response");

  // Use the access token to hit Intuit's OpenID userinfo endpoint for the verified email.
  const infoRes = await fetch(userinfoUrl, {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
  });
  if (!infoRes.ok) throw new Error(`QuickBooks userinfo failed (${infoRes.status})`);
  const info = (await infoRes.json()) as {
    email?: string;
    emailVerified?: boolean;
    email_verified?: boolean;
    sub?: string;
  };

  const email = String(info.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("no email from QuickBooks userinfo");

  // Intuit returns emailVerified (camelCase); accept email_verified too for safety.
  const emailVerified = info.emailVerified === true || info.email_verified === true;
  return { email, emailVerified };
}
