import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSession,
  recordLoginAttempt,
  sweepExpiredSessions,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";

// A throwaway hash/salt of the right shape. When the email doesn't exist we still run a full scrypt
// verify against this so response timing doesn't reveal whether an account exists (no enumeration).
const DUMMY_HASH = "00".repeat(64);
const DUMMY_SALT = "00".repeat(16);

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return Response.json({ error: "email and password required" }, { status: 400 });

  if (await tooManyAttempts(email)) {
    return Response.json({ error: "too many attempts — wait 15 minutes" }, { status: 429 });
  }

  const row = (
    await db.execute({
      sql: `SELECT id, name, email, role, scope, pass_hash, salt FROM users WHERE email = ? AND active = 1`,
      args: [email],
    })
  ).rows[0];

  let ok: boolean;
  if (row) {
    ok = await verifyPassword(password, String(row.pass_hash), String(row.salt));
  } else {
    await verifyPassword(password, DUMMY_HASH, DUMMY_SALT); // burn equivalent time, then fail
    ok = false;
  }

  await recordLoginAttempt(email, ok);
  if (!ok || !row) return Response.json({ error: "invalid email or password" }, { status: 401 });

  await sweepExpiredSessions();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const token = await createSession(Number(row.id), ip);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax (not Strict) so the session survives top-level cross-site redirects back into the
    // app — e.g. returning from Trello's authorize screen. Strict made proxy.ts see "no
    // session" on that hop and bounce to /login, killing the OAuth grant. Matches every other
    // login path (Google/Microsoft/QuickBooks/dev-login all use Lax).
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return Response.json({
    ok: true,
    user: {
      id: Number(row.id),
      name: String(row.name),
      email: String(row.email),
      role: row.role,
      scope: row.scope ?? null,
    },
  });
}
