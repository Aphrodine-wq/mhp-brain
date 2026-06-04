// Dependency-free auth constants. proxy.ts imports from here (NOT from lib/auth) so the proxy bundle
// never pulls in pg / next/headers — the proxy only needs the cookie name to do its presence check.

// The session cookie the login flow sets and every guard reads. Value is a sessions.token.
export const SESSION_COOKIE = "mhp_session";
