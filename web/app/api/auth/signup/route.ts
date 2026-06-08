import { createPendingUser } from "@/lib/auth";

// Self-service account creation. New accounts are created INACTIVE ("pending admin approval"): the
// row exists but every sign-in path filters active=1, so a new sign-up cannot reach any data until
// an admin activates them. We always answer with the same generic success — whether the account was
// created or the email was already taken — so the form can't be used to enumerate who has an account.

const MIN_PASSWORD = 8;
// Pragmatic email shape check (the real proof is admin activation, not regex gymnastics).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (password.length < MIN_PASSWORD) {
    return Response.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }

  // Result intentionally ignored in the response: created vs. already-exists look identical to the
  // caller. (createPendingUser is a no-op on a duplicate email.)
  await createPendingUser(name, email, password);

  return Response.json({ ok: true });
}
