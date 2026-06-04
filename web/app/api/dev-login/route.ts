import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth";

// One-click admin bypass.
//   - Local dev (NODE_ENV !== production): open — the "Dev sign-in" button POSTs here, no key.
//   - Production: gated by a secret. Only a request carrying ?key=<DEV_BYPASS_KEY> gets in; anything
//     else 404s. So it's NOT a public backdoor to the books — it's James's bookmarkable magic link:
//       https://mhp-brain.vercel.app/api/dev-login?key=<DEV_BYPASS_KEY>
//     Set DEV_BYPASS_KEY in the Vercel env; rotate it anytime to kill old links.
const isProd = () => process.env.NODE_ENV === "production";

function keyOk(provided: string | null): boolean {
  const secret = process.env.DEV_BYPASS_KEY;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mint an admin session (the real admin if seeded, else a dev admin) and set the cookie.
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
    secure: isProd(),
    sameSite: "lax", // lax so a clicked magic-link (top-level GET) carries the cookie through the redirect
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

// GET = the bookmarkable magic link: logs in, then drops you on the dashboard.
export async function GET(req: NextRequest) {
  if (isProd() && !keyOk(req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await grantAdmin();
  return NextResponse.redirect(new URL("/", req.url));
}

// POST = the on-page "Dev sign-in" button (local dev; in prod still needs ?key=).
export async function POST(req: NextRequest) {
  if (isProd() && !keyOk(req.nextUrl.searchParams.get("key"))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  await grantAdmin();
  return Response.json({ ok: true });
}
