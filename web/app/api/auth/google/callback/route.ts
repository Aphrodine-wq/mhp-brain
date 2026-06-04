import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession, sweepExpiredSessions } from "@/lib/auth";
import { exchangeCodeForIdentity } from "@/lib/google-auth";

// Step 2 of "Sign in with Google": Google redirects here with ?code & ?state. Public route.
// Guard order: state-cookie match (CSRF) -> code exchange + ID-token verify -> the allowlist check
// (email must already be an active user) -> mint a session. Any failure bounces to /login?error=…
// with the state cookies cleared, never leaking why beyond a coarse reason.

const STATE_COOKIES = ["g_state", "g_nonce", "g_next"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const jar = await cookies();

  const fail = (reason: string) => {
    for (const c of STATE_COOKIES) jar.delete(c);
    return NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
  };

  // Google-side refusal (user hit Cancel, consent denied, etc.).
  if (sp.get("error")) return fail("google_denied");

  const code = sp.get("code");
  const state = sp.get("state");
  const expectedState = jar.get("g_state")?.value;
  const nonce = jar.get("g_nonce")?.value;
  const rawNext = jar.get("g_next")?.value;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  // Never trust ?state alone — it must match the cookie we set at /start.
  if (!code || !state || !expectedState || state !== expectedState || !nonce) {
    return fail("state_mismatch");
  }

  let identity: { email: string; emailVerified: boolean };
  try {
    identity = await exchangeCodeForIdentity(code, nonce);
  } catch {
    return fail("google_failed");
  }
  // An unverified Google email is unowned — never bind a session to it.
  if (!identity.emailVerified) return fail("email_unverified");

  // Allowlist: a Google identity signs in ONLY if it already maps to an active user. No JIT users.
  const row = (
    await db.execute({
      sql: `SELECT id FROM users WHERE email = ? AND active = 1`,
      args: [identity.email],
    })
  ).rows[0];
  if (!row) return fail("not_authorized");

  await sweepExpiredSessions();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const token = await createSession(Number(row.id), ip);

  for (const c of STATE_COOKIES) jar.delete(c);
  // SameSite=Lax (not Strict like /api/login): this cookie is set on a response the browser reaches
  // by following Google's cross-site redirect, then we navigate to `next`. Lax survives that
  // top-level-GET chain; Strict can drop the cookie on the first post-redirect hop -> login loop.
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return NextResponse.redirect(new URL(next, req.url));
}
