import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth";

// DEV ONLY — one-click admin session for local dev work, so you're not retyping creds.
//
// Hard-disabled in production: Vercel sets NODE_ENV=production on EVERY deployment (production AND
// preview), so this route 404s there and can never mint a session. It only lives under `next dev`.
// The dev user it creates has an unusable password hash, so it can't be logged into via the form
// either — the only door to it is this dev-only route.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const email = "dev@mhp.local";
  let row = (await db.execute({ sql: `SELECT id FROM users WHERE email = ?`, args: [email] })).rows[0];
  if (!row) {
    row = (
      await db.execute({
        sql: `INSERT INTO users (name, email, role, pass_hash, salt, scope, active)
              VALUES ('Dev Admin', ?, 'admin', 'x', 'x', NULL, 1) RETURNING id`,
        args: [email],
      })
    ).rows[0];
  }

  const token = await createSession(Number(row.id), null);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: false, // dev only, http://localhost
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return Response.json({ ok: true, user: "dev@mhp.local (admin)" });
}
