import { ProxyAgent, type Dispatcher } from "undici";
import { providerConfig, type ProviderId } from "./providers";
import { audit, deleteConnection, loadConnection, saveConnection, type Connection } from "./store";

// Refresh a minute before expiry — never hand a caller a token that dies mid-request.
const REFRESH_MARGIN_MS = 60_000;

// QuickBooks production requires API calls to egress from an allowlisted static IP, but Vercel
// functions run on rotating Lambda IPs. When QB_EGRESS_PROXY is set (a static-IP forward proxy,
// e.g. QuotaGuard), route the Intuit-bound fetches through it so they exit from one fixed IP that
// can be allowlisted in the Intuit app profile. Unset (sandbox / local / non-QB) -> direct, no proxy.
// Node's global fetch ignores HTTPS_PROXY, so this must be wired as an explicit undici dispatcher.
let qbProxyAgent: ProxyAgent | null | undefined;
function qbDispatcher(provider: ProviderId): Dispatcher | undefined {
  if (provider !== "quickbooks") return undefined;
  if (qbProxyAgent === undefined) {
    const url = process.env.QB_EGRESS_PROXY;
    qbProxyAgent = url ? new ProxyAgent(url) : null; // memoize: build the agent once, reuse the pool
  }
  return qbProxyAgent ?? undefined;
}

// Raised when a refresh/exchange fails with invalid_grant — i.e. the refresh token is expired or
// revoked and no token call will recover it. Callers catch this to send the customer back through
// the connect flow (the dead connection is cleared from the store so the UI shows "Not connected").
export class ReconnectRequiredError extends Error {
  account?: string;
  constructor(public provider: ProviderId) {
    super(`${provider} authorization expired — the customer needs to reconnect (invalid_grant).`);
    this.name = "ReconnectRequiredError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Retry only TRANSIENT failures (network blips, 5xx, 429) with backoff. Never retry a 4xx — an auth
// error like invalid_grant is permanent, and retrying would just hammer Intuit and slow the user's
// error. Returns the final response (even a 5xx) so the caller can read and surface it.
async function fetchWithRetry(
  url: string,
  init: RequestInit & { dispatcher?: Dispatcher },
  tries = 3,
): Promise<Response> {
  const backoff = [250, 750]; // ms before retry 2 and 3
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500 && res.status !== 429) return res; // success or permanent client error
      if (i === tries - 1) return res; // exhausted — hand the final 5xx/429 back to the caller
      lastErr = new Error(`${url} -> HTTP ${res.status}`);
    } catch (e) {
      lastErr = e; // network-level failure
      if (i === tries - 1) throw e;
    }
    await sleep(backoff[i] ?? 1000);
  }
  throw lastErr ?? new Error(`${url} unreachable`);
}

// Intuit publishes its current OAuth2 endpoints in a discovery document. Resolving them from there
// (instead of hardcoding) means we follow Intuit if a host moves — the OAuth2.0-flow endpoints stay
// current. Cached for the process lifetime; falls back to the static endpoints if the doc is
// unreachable, so discovery can never block a connect. Only QuickBooks uses this (Google/MS configs
// carry their own endpoints in providerConfig).
const INTUIT_DISCOVERY: Record<string, string> = {
  production: "https://developer.api.intuit.com/.well-known/openid_configuration",
  sandbox: "https://developer.api.intuit.com/.well-known/openid_sandbox_configuration",
};
interface IntuitEndpoints { authorize: string; token: string; revoke: string }
const INTUIT_FALLBACK: IntuitEndpoints = {
  authorize: "https://appcenter.intuit.com/connect/oauth2",
  token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revoke: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
};
let intuitEndpointsCache: IntuitEndpoints | undefined;
async function intuitEndpoints(): Promise<IntuitEndpoints> {
  if (intuitEndpointsCache) return intuitEndpointsCache;
  try {
    const env = process.env.QB_ENV === "sandbox" ? "sandbox" : "production";
    const init: RequestInit & { dispatcher?: Dispatcher } = { headers: { Accept: "application/json" } };
    const d = qbDispatcher("quickbooks"); // discovery is an Intuit call — exit the allowlisted IP too
    if (d) init.dispatcher = d;
    const res = await fetchWithRetry(INTUIT_DISCOVERY[env], init);
    if (!res.ok) throw new Error(`discovery ${res.status}`);
    const doc = (await res.json()) as Record<string, string>;
    intuitEndpointsCache = {
      authorize: doc.authorization_endpoint || INTUIT_FALLBACK.authorize,
      token: doc.token_endpoint || INTUIT_FALLBACK.token,
      revoke: doc.revocation_endpoint || INTUIT_FALLBACK.revoke,
    };
  } catch {
    intuitEndpointsCache = INTUIT_FALLBACK; // best-effort: never block auth on the discovery fetch
  }
  return intuitEndpointsCache;
}

// Step 1 of the flow: where to send the user to consent. `state` is the caller's CSRF token
// (mint + verify it in the callback route against the session — that's not this module's job).
export async function getAuthorizeUrl(provider: ProviderId, state: string): Promise<string> {
  const cfg = providerConfig(provider);
  // QuickBooks: use the authorize endpoint from Intuit's discovery document, not the hardcoded one.
  const authorizeUrl = provider === "quickbooks" ? (await intuitEndpoints()).authorize : cfg.authorizeUrl;
  const u = new URL(authorizeUrl);
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

// Intuit and Google accept client_secret_basic (creds in the Authorization header).
// Microsoft requires client_secret_post (creds in the body). Handle both.
async function tokenRequest(provider: ProviderId, body: Record<string, string>): Promise<TokenResponse> {
  const cfg = providerConfig(provider);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  // Microsoft's v2.0 token endpoint requires client_id + client_secret in the POST body,
  // not in the Authorization header. QB and Google accept basic auth.
  if (provider === "microsoft") {
    body.client_id = cfg.clientId;
    body.client_secret = cfg.clientSecret;
  } else {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  }

  const init: RequestInit & { dispatcher?: Dispatcher } = {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  };
  const dispatcher = qbDispatcher(provider);
  if (dispatcher) init.dispatcher = dispatcher;

  // QuickBooks: use the token endpoint from Intuit's discovery document, not the hardcoded one.
  const tokenUrl = provider === "quickbooks" ? (await intuitEndpoints()).token : cfg.tokenUrl;

  const res = await fetchWithRetry(tokenUrl, init);
  if (!res.ok) {
    const text = await res.text();
    // invalid_grant = the refresh token is expired/revoked (or the auth code was bad/replayed).
    // No retry recovers this — surface it as a reconnect, not a generic failure.
    if (res.status === 400 && /invalid_grant/i.test(text)) throw new ReconnectRequiredError(provider);
    throw new Error(`${provider} token endpoint ${res.status}: ${text}`);
  }
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
  let tok: TokenResponse;
  try {
    tok = await tokenRequest(provider, {
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
    });
  } catch (e) {
    if (e instanceof ReconnectRequiredError) {
      // Refresh token is dead. Forget the connection so listConnections() drops it and the
      // Integrations page shows "Not connected" with a Connect button — i.e. prompts a reconnect.
      await deleteConnection(provider, account);
      await audit(provider, account, "reconnect_required", "invalid_grant on refresh — connection cleared");
      e.account = account;
    }
    throw e;
  }
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

// Revoke a token at the provider. Intuit and Google expose a revoke endpoint; Microsoft has no
// per-app programmatic revoke (users revoke from their M365 account), so it no-ops and we rely on
// the local delete. Intuit revoking a refresh token invalidates the whole grant (access + refresh).
async function revokeToken(provider: ProviderId, token: string): Promise<void> {
  const cfg = providerConfig(provider);
  if (provider === "quickbooks") {
    const init: RequestInit & { dispatcher?: Dispatcher } = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      },
      body: JSON.stringify({ token }),
    };
    const dispatcher = qbDispatcher("quickbooks");
    if (dispatcher) init.dispatcher = dispatcher;
    const res = await fetchWithRetry((await intuitEndpoints()).revoke, init);
    if (!res.ok) throw new Error(`quickbooks revoke ${res.status}: ${await res.text()}`);
  } else if (provider === "gmail") {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) throw new Error(`gmail revoke ${res.status}: ${await res.text()}`);
  }
  // microsoft: no-op — no programmatic per-app revoke.
}

// Disconnect: revoke at the provider (best-effort), then forget the connection locally. The remote
// revoke is best-effort on purpose — if the token is already dead (e.g. the user disconnected from
// inside QuickBooks first), the revoke 4xxs, but we must still delete locally so the UI is truthful.
export async function disconnect(provider: ProviderId, account: string): Promise<void> {
  const conn = await loadConnection(provider, account);
  if (conn) {
    try {
      await revokeToken(provider, conn.refreshToken);
    } catch {
      // swallow — the local delete below is what guarantees "disconnected"
    }
  }
  await deleteConnection(provider, account);
}
