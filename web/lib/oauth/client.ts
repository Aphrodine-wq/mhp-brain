import { providerConfig, type ProviderId } from "./providers";
import { audit, loadConnection, saveConnection, type Connection } from "./store";

// Refresh a minute before expiry — never hand a caller a token that dies mid-request.
const REFRESH_MARGIN_MS = 60_000;

// Step 1 of the flow: where to send the user to consent. `state` is the caller's CSRF token
// (mint + verify it in the callback route against the session — that's not this module's job).
export function getAuthorizeUrl(provider: ProviderId, state: string): string {
  const cfg = providerConfig(provider);
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scopes.join(" "));
  u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams)) u.searchParams.set(k, v);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

// Both Intuit and Google accept client_secret_basic (creds in the Authorization header) + a
// form-encoded body. One code path covers both.
async function tokenRequest(provider: ProviderId, body: Record<string, string>): Promise<TokenResponse> {
  const cfg = providerConfig(provider);
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`${provider} token endpoint ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

function expiryISO(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

// Step 2: exchange the authorization code for tokens and persist the connection.
// `account` = the QB realmId (from the QB callback) or the Gmail box address (from the Gmail callback).
export async function exchangeCode(
  provider: ProviderId,
  opts: { code: string; account: string; realmId?: string },
): Promise<Connection> {
  const cfg = providerConfig(provider);
  const tok = await tokenRequest(provider, {
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: cfg.redirectUri,
  });
  if (!tok.refresh_token) {
    throw new Error(`${provider} returned no refresh_token — re-consent with offline access enabled.`);
  }
  const conn: Connection = {
    provider,
    account: opts.account,
    realmId: opts.realmId ?? null,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: expiryISO(tok.expires_in),
    scope: tok.scope ?? cfg.scopes.join(" "),
  };
  await saveConnection(conn);
  return conn;
}

export async function refreshNow(provider: ProviderId, account: string): Promise<Connection> {
  const existing = await loadConnection(provider, account);
  if (!existing) throw new Error(`No ${provider} connection for ${account}.`);
  const tok = await tokenRequest(provider, {
    grant_type: "refresh_token",
    refresh_token: existing.refreshToken,
  });
  const conn: Connection = {
    ...existing,
    accessToken: tok.access_token,
    // Intuit rotates the refresh token; Google usually omits it on refresh. Keep the old one if absent.
    refreshToken: tok.refresh_token ?? existing.refreshToken,
    expiresAt: expiryISO(tok.expires_in),
    scope: tok.scope ?? existing.scope,
  };
  await saveConnection(conn);
  await audit(provider, account, "refresh", `expires_at=${conn.expiresAt}`);
  return conn;
}

// The one call every consumer uses (QB sync, Gmail sync, FTW): always returns a live access token,
// refreshing transparently when the current one is within the margin of dying.
export async function getValidAccessToken(provider: ProviderId, account: string): Promise<string> {
  const conn = await loadConnection(provider, account);
  if (!conn) throw new Error(`No ${provider} connection for ${account}. Run the authorize flow first.`);
  if (Date.parse(conn.expiresAt) - Date.now() > REFRESH_MARGIN_MS) return conn.accessToken;
  return (await refreshNow(provider, account)).accessToken;
}
