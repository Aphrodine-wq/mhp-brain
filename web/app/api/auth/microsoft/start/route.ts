import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, msAuthConfigured, newState } from "@/lib/ms-auth";

// Step 1 of "Sign in with Microsoft": GET /api/auth/microsoft/start?next=/somewhere
const STATE_TTL = 600;

export async function GET(req: NextRequest) {
  if (!msAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=microsoft_unavailable", req.url));
  }

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
  jar.set("ms_state", state, opts);
  jar.set("ms_nonce", nonce, opts);
  jar.set("ms_next", next, opts);

  return NextResponse.redirect(buildAuthUrl(state, nonce));
}
