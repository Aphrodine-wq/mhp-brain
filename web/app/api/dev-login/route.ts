import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth";

// One-click admin bypass behind the "Skip login" button on /login.
//   - local dev: always on.
//   - production: on only when ALLOW_DEV_BUTTON=1 is set in the env (James flips it on for UI/UX
//     work; delete the env var + redeploy to remove the button). When off it 404s.
// HEADS UP: while it's on, anyone who reaches /login and clicks the button is admin. Fine pre-launch
// on an obscure URL / behind Vercel Deployment Protection — turn it off before real users.
function enabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_BUTTON === "1";
}

async function grantAdmin(): Promise<void> {
  let row = (
    await db.execute({
      sql: `SELECT id FROM users
             WHERE email IN ('james@mshomepros.com','dev@mhp.local') AND role='admin' AND active=1
             ORDER BY (email = 'james@mshomepros.com') DESC LIMIT 1`,
    })
  ).rows[0];
  if (!row) {
    row = (
      await db.execute({
        sql: `INSERT INTO users (name, email, role, pass_hash, salt, scope, active)
              VALUES ('Dev Admin', 'dev@mhp.local', 'admin', 'x', 'x', NULL, 1) RETURNING id`,
      })
    ).rows[0];
  }
  const token = await createSession(Number(row.id), null);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days — log in once via the button, stay in while you work
  });
}

// The button POSTs here.
export async function POST() {
  if (!enabled()) return Response.json({ error: "not found" }, { status: 404 });
  await grantAdmin();
  return Response.json({ ok: true });
}

// GET works too (direct nav) and drops you on the dashboard.
export async function GET(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  await grantAdmin();
  return NextResponse.redirect(new URL("/", req.url));
}
