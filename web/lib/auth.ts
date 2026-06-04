import { cookies } from "next/headers";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-constants";

// Hand-rolled session-cookie auth (no Auth.js): scrypt password hashing, random session tokens, a
// sessions table, and an httpOnly/Secure cookie. Minimal deps, full control over the audit identity
// + role matrix. Runs in the Node route handlers / server components — NOT in proxy.ts (Edge-shaped).

export { SESSION_COOKIE };

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  scope: string | null;
}

const scryptAsync = promisify(scrypt);
const KEYLEN = 64; // scrypt derived-key length, bytes
const SALT_BYTES = 16;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_FAILS = 5; // > 5 failed logins / email / 15 min -> 429
const FAIL_WINDOW = "15 minutes";

// Role hierarchy: a higher rank satisfies every gate at or below it.
const RANK: Record<SessionUser["role"], number> = { viewer: 0, editor: 1, admin: 2 };

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
export async function currentUser(): Promise<SessionUser | null> {
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
}

// Gate by minimum role. Returns the user when they satisfy it, else null (caller answers 401/403).
export async function requireRole(min: SessionUser["role"]): Promise<SessionUser | null> {
  const u = await currentUser();
  if (!u) return null;
  return RANK[u.role] >= RANK[min] ? u : null;
}

// Connecting QuickBooks or Gmail mints a months-long key to the company's books/mailbox — admin only.
export async function requireAdmin(): Promise<SessionUser | null> {
  return requireRole("admin");
}
