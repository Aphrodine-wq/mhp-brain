import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, googleAuthConfigured, newState } from "@/lib/google-auth";

// Step 1 of "Sign in with Google": GET /api/auth/google/start?next=/somewhere
// Public (no session yet — this IS the login). Stash state + nonce + the return path in short-lived
// httpOnly cookies, then bounce to Google's consent screen. SameSite=Lax so the cookies survive the
// top-level redirect back from Google (Strict would drop them on the cross-site hop).

const STATE_TTL = 600; // seconds — the consent round-trip is short-lived

export async function GET(req: NextRequest) {
  if (!googleAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", req.url));
  }

  // Only ever return to a local path (no open redirect to //evil.com), same rule as the login page.
  const raw = req.nextUrl.searchParams.get("next");
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const state = newState();
  const nonce = newState();
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: STATE_TTL,
  };
  jar.set("g_state", state, opts);
  jar.set("g_nonce", nonce, opts);
  jar.set("g_next", next, opts);

  return NextResponse.redirect(buildAuthUrl(state, nonce));
}
