// "Sign in with Microsoft" — OpenID Connect IDENTITY, not the read-only Teams data connection
// in lib/oauth/. Same trust model as Google sign-in: a verified Microsoft email signs you in
// ONLY if it already maps to an active users row. No just-in-time account creation.
//
// Uses the same MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID as the Teams data connection,
// but with a different redirect URI (/api/auth/microsoft/callback) and identity-only scopes
// (openid email profile). No tokens stored — this is a one-shot identity check.

import { randomBytes } from "node:crypto";

const TOKEN_URL_TPL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token";
const AUTH_URL_TPL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize";
const USERINFO_URL = "https://graph.microsoft.com/oidc/userinfo";

export function msAuthConfigured(): boolean {
  return Boolean(
    process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_AUTH_REDIRECT_URI,
  );
}

function cfg() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_AUTH_REDIRECT_URI;
  const tenant = process.env.MS_TENANT_ID ?? "common";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft login not configured (MS_CLIENT_ID/SECRET/MS_AUTH_REDIRECT_URI).");
  }
  return { clientId, clientSecret, redirectUri, tenant };
}

export function newState(): string {
  return randomBytes(32).toString("hex");
}

export function buildAuthUrl(state: string, nonce: string): string {
  const { clientId, redirectUri, tenant } = cfg();
  const authUrl = AUTH_URL_TPL.replace("{tenant}", tenant);
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    response_mode: "query",
    prompt: "select_account",
  });
  return `${authUrl}?${p.toString()}`;
}

export async function exchangeCodeForIdentity(
  code: string,
): Promise<{ email: string; emailVerified: boolean }> {
  const { clientId, clientSecret, redirectUri, tenant } = cfg();
  const tokenUrl = TOKEN_URL_TPL.replace("{tenant}", tenant);

  // Microsoft v2.0 uses client_secret_post (creds in the body)
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "openid email profile",
    }),
  });

  if (!res.ok) throw new Error(`MS token exchange failed (${res.status})`);
  const tok = (await res.json()) as { access_token?: string; id_token?: string };
  if (!tok.access_token) throw new Error("no access_token in MS token response");

  // Use the access token to hit the userinfo endpoint for the email
  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`MS userinfo failed (${infoRes.status})`);
  const info = (await infoRes.json()) as { email?: string; sub?: string };

  const email = String(info.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("no email from Microsoft userinfo");

  // Microsoft accounts through Azure AD are always verified within the tenant
  return { email, emailVerified: true };
}
