import { cookies } from "next/headers";
import { db } from "@/lib/db";

// The session cookie the login flow sets (not yet built) and every guard reads. Defined here so
// both sides share one name. Value is a sessions.token.
export const SESSION_COOKIE = "mhp_session";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  scope: string | null;
}

// Resolve the signed-in user from the session cookie, or null. Matches the users/sessions schema in
// migration 001 (token cookie -> live sessions row -> active user).
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = (
    await db.execute({
      sql: `SELECT u.id, u.name, u.email, u.role, u.scope
              FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`,
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

// Connecting QuickBooks or Gmail mints a months-long key to the company's books/mailbox — admin only.
export async function requireAdmin(): Promise<SessionUser | null> {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}
