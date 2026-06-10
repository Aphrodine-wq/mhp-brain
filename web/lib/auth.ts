import { cookies } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-constants";

// Hand-rolled session-cookie auth (no Auth.js): scrypt password hashing, random session tokens, a
// sessions table, and an httpOnly/Secure cookie. Minimal deps, full control over the audit identity
// + role matrix. Runs in the Node route handlers / server components — NOT in proxy.ts (Edge-shaped).

export { SESSION_COOKIE };

export type Role = "admin" | "ceo" | "estimator" | "sales" | "materials" | "editor" | "viewer" | "crew";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  scope: string | null;
}

const scryptAsync = promisify(scrypt);
const KEYLEN = 64; // scrypt derived-key length, bytes
const SALT_BYTES = 16;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_FAILS = 5; // > 5 failed logins / email / 15 min -> 429
const FAIL_WINDOW = "15 minutes";
const RESET_TTL_MS = 60 * 60 * 1000; // password-reset token lifetime: 1h

// Role hierarchy: a higher rank satisfies every gate at or below it.
// Functional roles (ceo, estimator, sales, materials) are all at editor-level for writes.
// Admin is above everything. Viewer is read-only.
const RANK: Record<Role, number> = {
  crew: 0,    // field team — read-only, no client financials
  viewer: 0,
  materials: 1,
  sales: 1,
  estimator: 1,
  editor: 1,  // legacy — maps to generic editor
  ceo: 2,     // CEO can see and do everything except system config
  admin: 3,
};

// --- password hashing (scrypt) ----------------------------------------------------------------

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return { hash: derived.toString("hex"), salt: salt.toString("hex") };
}

// Constant-time verify. Derives with the SAME keylen as the stored hash so timingSafeEqual never
// throws on a length mismatch (and a malformed/empty stored hash simply fails closed).
export async function verifyPassword(password: string, hashHex: string, saltHex: string): Promise<boolean> {
  const expected = Buffer.from(hashHex, "hex");
  const salt = Buffer.from(saltHex, "hex");
  if (expected.length === 0 || salt.length === 0) return false;
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- sessions ----------------------------------------------------------------------------------

// Mint a session row and return its token (the cookie value). expires_at is an ISO string; every
// read compares it as ::timestamptz so the text format never bites us.
export async function createSession(userId: number, ip: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.execute({
    sql: `INSERT INTO sessions (token, user_id, expires_at, ip) VALUES (?, ?, ?, ?)`,
    args: [token, userId, expiresAt, ip],
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.execute({ sql: `DELETE FROM sessions WHERE token = ?`, args: [token] });
}

// Lazy GC, called on every login so dead rows never accumulate without a cron.
export async function sweepExpiredSessions(): Promise<void> {
  await db.execute(`DELETE FROM sessions WHERE expires_at::timestamptz < now()`);
}

// --- brute-force throttle ----------------------------------------------------------------------

export async function recordLoginAttempt(email: string, ok: boolean): Promise<void> {
  await db.execute({
    sql: `INSERT INTO login_attempts (email, ok) VALUES (?, ?)`,
    args: [email, ok ? 1 : 0],
  });
}

export async function tooManyAttempts(email: string): Promise<boolean> {
  const row = (
    await db.execute({
      sql: `SELECT count(*)::int AS n FROM login_attempts
             WHERE email = ? AND ok = 0 AND ts::timestamptz > now() - interval '${FAIL_WINDOW}'`,
      args: [email],
    })
  ).rows[0];
  return Number(row?.n ?? 0) >= MAX_FAILS;
}

// --- identity ----------------------------------------------------------------------------------

// The single identity source: the sid cookie -> a live session -> the active user. Read-only, safe
// to call from any server component / route handler (incl. the root layout).
//
// Wrapped in React.cache so the (cookie-stable) lookup runs ONCE per request even though the root
// layout and the page both call it — one DB round-trip per navigation instead of two.
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = (
    await db.execute({
      sql: `SELECT u.id, u.name, u.email, u.role, u.scope
              FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token = ? AND s.expires_at::timestamptz > now() AND u.active = 1`,
      args: [token],
    })
  ).rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role as SessionUser["role"],
    scope: row.scope === null ? null : String(row.scope),
  };
});

// Authenticated-only gate (any role). Returns the user or null; the caller answers 401. Completes
// the require* family — read routes use this, write routes use requireRole; integration (oauth/teams)
// routes use requireRole("ceo").
export async function requireUser(): Promise<SessionUser | null> {
  return currentUser();
}

// Gate by minimum role. Returns the user when they satisfy it, else null (caller answers 401/403).
export async function requireRole(min: SessionUser["role"]): Promise<SessionUser | null> {
  const u = await currentUser();
  if (!u) return null;
  return RANK[u.role] >= RANK[min] ? u : null;
}

// Connecting QuickBooks/Gmail/Teams mints a months-long key to the company's books/mailbox —
// admin or CEO only (it's the CEO's books; integration routes gate with requireRole("ceo")).

// --- self-registration -------------------------------------------------------------------------

// Create a self-registered account. New sign-ups land as active=0 ("pending admin approval") with
// the lowest role — they can't sign in (every login + OAuth path filters active=1) until an admin
// activates them. Idempotent on email: an existing address is left untouched and we report false,
// so the route can answer with the SAME generic message either way (no account enumeration).
export async function createPendingUser(name: string, email: string, password: string): Promise<boolean> {
  const { hash, salt } = await hashPassword(password);
  const res = await db.execute({
    sql: `INSERT INTO users (name, email, role, pass_hash, salt, scope, active)
            VALUES (?, ?, 'viewer', ?, ?, NULL, 0)
          ON CONFLICT (email) DO NOTHING
          RETURNING id`,
    args: [name, email, hash, salt],
  });
  return res.rows.length > 0;
}

// --- password reset ----------------------------------------------------------------------------

// Tokens are random and handed out raw (in the emailed link); only their SHA-256 hash is stored, so
// a DB read can't be replayed to reset an account. Lower-cased hex keeps lookups deterministic.
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Look up an ACTIVE user by email (reset is for people who can actually sign in). Returns id or null.
export async function activeUserIdByEmail(email: string): Promise<number | null> {
  const row = (
    await db.execute({ sql: `SELECT id FROM users WHERE email = ? AND active = 1`, args: [email] })
  ).rows[0];
  return row ? Number(row.id) : null;
}

// Mint a single-use reset token for a user and return the RAW token (goes in the link, never stored).
// Any older tokens for that user are dropped first so only the newest link works.
export async function createPasswordReset(userId: number): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await db.execute({ sql: `DELETE FROM password_resets WHERE user_id = ?`, args: [userId] });
  await db.execute({
    sql: `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    args: [hashToken(raw), userId, expiresAt],
  });
  return raw;
}

// Validate a raw reset token WITHOUT consuming it (drives the reset page's "is this link still good?"
// check). Returns the user id, or null if unknown/expired/already used.
export async function checkPasswordReset(raw: string): Promise<number | null> {
  if (!raw) return null;
  const row = (
    await db.execute({
      sql: `SELECT user_id FROM password_resets
             WHERE token_hash = ? AND used = 0 AND expires_at::timestamptz > now()`,
      args: [hashToken(raw)],
    })
  ).rows[0];
  return row ? Number(row.user_id) : null;
}

// Consume a reset token + set the new password atomically: mark the token used, rotate the password
// hash, and kill every existing session for that user (so a leaked old cookie dies on reset). All
// or nothing — a failure rolls the whole thing back. Returns true on success, false if the token is
// no longer valid (unknown/expired/used), which the route surfaces as an expired-link message.
export async function resetPasswordWithToken(raw: string, newPassword: string): Promise<boolean> {
  if (!raw) return false;
  const { hash, salt } = await hashPassword(newPassword);
  const tx = await db.transaction("write");
  try {
    const claimed = await tx.execute({
      sql: `UPDATE password_resets SET used = 1
             WHERE token_hash = ? AND used = 0 AND expires_at::timestamptz > now()
           RETURNING user_id`,
      args: [hashToken(raw)],
    });
    const userId = claimed.rows[0]?.user_id;
    if (userId == null) {
      await tx.rollback();
      return false;
    }
    await tx.execute({
      sql: `UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?`,
      args: [hash, salt, Number(userId)],
    });
    await tx.execute({ sql: `DELETE FROM sessions WHERE user_id = ?`, args: [Number(userId)] });
    await tx.commit();
    return true;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
