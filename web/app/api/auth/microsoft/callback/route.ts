import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession, sweepExpiredSessions } from "@/lib/auth";
import { exchangeCodeForIdentity } from "@/lib/ms-auth";

// Step 2 of "Sign in with Microsoft": Microsoft redirects here with ?code & ?state.
const STATE_COOKIES = ["ms_state", "ms_nonce", "ms_next"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const jar = await cookies();

  const fail = (reason: string) => {
    for (const c of STATE_COOKIES) jar.delete(c);
    return NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
  };

  if (sp.get("error")) return fail("microsoft_denied");

  const code = sp.get("code");
  const state = sp.get("state");
  const expectedState = jar.get("ms_state")?.value;
  const rawNext = jar.get("ms_next")?.value;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("state_mismatch");
  }

  let identity: { email: string; emailVerified: boolean };
  try {
    identity = await exchangeCodeForIdentity(code);
  } catch {
    return fail("microsoft_failed");
  }
  if (!identity.emailVerified) return fail("email_unverified");

  // Allowlist check — email must already be an active user
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
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return NextResponse.redirect(new URL(next, req.url));
}
