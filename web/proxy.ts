import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

// Next 16 renamed `middleware` -> `proxy` (Node runtime by default). This is the OPTIMISTIC gate:
// it only checks that a session cookie is PRESENT and bounces requests that have none. It does NOT
// hit the DB — token validity, expiry, and role are enforced in the Node route handlers / server
// components via currentUser()/requireRole(). Defense in depth, no DB round-trip per asset.

// /api/dev-login is public so the (dev-only) one-click login can mint a session with no prior
// cookie — same chicken-and-egg as /api/login. It 404s in production regardless.
// The /api/auth/google/* pair is public for the same reason: they ARE the login, so they run
// before any session exists (the callback is what mints it).
const PUBLIC = new Set([
  "/login",
  "/api/login",
  "/api/dev-login",
  "/api/auth/google/start",
  "/api/auth/google/callback",
  // Public homeowner intake from the marketing site — submitters have no session.
  // The handler does its own hardening (validation, honeypot, per-IP rate limit,
  // CORS allowlist) and is insert-only, so it's safe to run un-gated.
  "/api/estimate-requests",
  // Self-service auth — these run before any session exists, so they must be reachable signed-out.
  "/signup",
  "/forgot",
  "/reset",
  "/api/auth/signup",
  "/api/auth/forgot",
  "/api/auth/reset",
  // Public legal pages — Intuit (and anyone) must read these signed-out; linked from the QB app listing.
  "/eula",
  "/privacy",
  // CLI connect landing — Intuit's prod redirect lands here with a single-use code; must load
  // without a session so the operator can copy the URL. It only echoes the requester's own query.
  "/api/oauth/manual-callback",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  // No cookie at all: APIs get a clean 401, page navigations get sent to /login (with a return path).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets (logos, favicon, images).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
