import { activeUserIdByEmail, createPasswordReset } from "@/lib/auth";
import { mailConfigured, sendPasswordResetEmail } from "@/lib/mailer";

// "Forgot password" request. Always returns the same generic success so the form can't reveal which
// emails have accounts. When the email maps to an ACTIVE user we mint a single-use, 1-hour token and
// email the reset link. If SMTP isn't configured yet (mailConfigured() === false) we log the link
// server-side instead, so the flow still works pre-launch and an admin can hand it off.

// Where reset links point. Prefer an explicit APP_URL; otherwise derive the origin from the request
// (works behind Vercel/proxies via x-forwarded-* with a sane host fallback).
function appOrigin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return Response.json({ error: "email required" }, { status: 400 });

  const userId = await activeUserIdByEmail(email);
  if (userId != null) {
    const raw = await createPasswordReset(userId);
    const resetUrl = `${appOrigin(req)}/reset?token=${encodeURIComponent(raw)}`;
    if (mailConfigured()) {
      await sendPasswordResetEmail(email, resetUrl);
    } else {
      // No SMTP wired up — surface the link in the server logs so it's recoverable pre-launch.
      console.warn(`[forgot-password] SMTP not configured. Reset link for ${email}: ${resetUrl}`);
    }
  }

  // Same answer whether or not the account exists.
  return Response.json({ ok: true });
}
