import { resetPasswordWithToken } from "@/lib/auth";

// Complete a password reset: { token, password } -> set the new password if the token is still valid
// (single-use, < 1h old). On success every existing session for that user is invalidated, so they
// (and anyone holding a stale cookie) must sign in again with the new password.

const MIN_PASSWORD = 8;

export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!token) return Response.json({ error: "This reset link is invalid." }, { status: 400 });
  if (password.length < MIN_PASSWORD) {
    return Response.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }

  const ok = await resetPasswordWithToken(token, password);
  if (!ok) {
    return Response.json(
      { error: "This reset link has expired or already been used. Request a new one." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
