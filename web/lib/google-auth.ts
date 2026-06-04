import { createPublicKey, createVerify, randomBytes, type JsonWebKeyInput } from "node:crypto";

// "Sign in with Google" — OpenID Connect IDENTITY, not the read-only Gmail data connection in
// lib/oauth/. Different trust model on purpose: this path is PUBLIC (it IS the login), it only
// answers "who is this", it stores NO token and reads NO mailbox. A verified Google email signs
// you in ONLY if it already maps to an active users row — there is no just-in-time account
// creation, so a random Google account can authenticate with Google and still be turned away here.
//
// Own client creds (GOOGLE_*), independent of the Gmail connection's lifecycle. You may point them
// at the same Google Cloud OAuth client as Gmail (just add this redirect URI) or a dedicated one —
// see OAUTH_SETUP.md. ID tokens are verified against Google's JWKS with Node's built-in crypto,
// no added dependency.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

// Cheap, throw-free presence check — drives whether the login page shows the Google button, so a
// missing cred can never render a button that 500s inside cfg().
export function googleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI,
  );
}

function cfg(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google login not configured (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).");
  }
  return { clientId, clientSecret, redirectUri };
}

export function newState(): string {
  return randomBytes(32).toString("hex");
}

export function buildAuthUrl(state: string, nonce: string): string {
  const { clientId, redirectUri } = cfg();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce, // bound into the ID token; we reject any token whose nonce doesn't match (replay guard)
    access_type: "online", // identity only — we don't want a refresh token we'd have to store
    prompt: "select_account",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

// --- ID token verification (RS256 over Google's JWKS, built-in crypto, no deps) -----------------

type GoogleJwk = { kid?: string; alg?: string; kty?: string; n?: string; e?: string };
interface JwtHeader {
  alg?: string;
  kid?: string;
}
interface IdClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
}

let jwksCache: { keys: GoogleJwk[]; exp: number } | null = null;

async function googleKeys(): Promise<GoogleJwk[]> {
  if (jwksCache && jwksCache.exp > Date.now()) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const body = (await res.json()) as { keys: GoogleJwk[] };
  // Honor Cache-Control max-age so the cache refreshes around Google's key rotation.
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  jwksCache = { keys: body.keys, exp: Date.now() + maxAge * 1000 };
  return body.keys;
}

function decodeSegment<T>(seg: string): T {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8")) as T;
}

async function verifyIdToken(idToken: string, expectedNonce: string): Promise<{ email: string; emailVerified: boolean }> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("malformed id_token");

  const header = decodeSegment<JwtHeader>(h);
  if (header.alg !== "RS256") throw new Error(`unexpected alg ${header.alg}`);

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("signing key not found in JWKS");
  // node:crypto's JsonWebKey carries a string index signature the DOM lib's JsonWebKey lacks, so the
  // plain object above won't structurally match without this assert to the crypto input type.
  const pub = createPublicKey({ key: jwk, format: "jwk" } as unknown as JsonWebKeyInput);

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  if (!verifier.verify(pub, Buffer.from(s, "base64url"))) throw new Error("bad signature");

  const claims = decodeSegment<IdClaims>(p);
  const { clientId } = cfg();
  const now = Math.floor(Date.now() / 1000);

  if (!claims.iss || !ISSUERS.has(claims.iss)) throw new Error("bad iss");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new Error("bad aud");
  if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new Error("token expired");
  if (typeof claims.iat === "number" && claims.iat > now + 300) throw new Error("token issued in the future");
  if (claims.nonce !== expectedNonce) throw new Error("nonce mismatch");

  const email = String(claims.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("no email claim");
  return { email, emailVerified: claims.email_verified === true };
}

// Exchange the auth code (server-to-server, over TLS, with our client_secret) and return the
// verified identity. Throws on any failure; the callback turns a throw into a /login?error=… bounce.
export async function exchangeCodeForIdentity(
  code: string,
  expectedNonce: string,
): Promise<{ email: string; emailVerified: boolean }> {
  const { clientId, clientSecret, redirectUri } = cfg();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) throw new Error("no id_token in token response");
  return verifyIdToken(tok.id_token, expectedNonce);
}
