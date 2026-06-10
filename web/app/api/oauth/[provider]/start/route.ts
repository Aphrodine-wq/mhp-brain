import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizeUrl, type ProviderId } from "@/lib/oauth";
import { requireRole } from "@/lib/auth";

// Step 1 of the OAuth flow: GET /api/oauth/<provider>/start
//   quickbooks -> realmId comes back on the callback.
//   gmail      -> pass ?account=<dedicated box address>; we carry it across the round-trip.

const PROVIDERS = new Set<ProviderId>(["quickbooks", "gmail", "microsoft", "docusign", "gbp"]);
const STATE_TTL = 600; // seconds — the consent screen round-trip is short-lived

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.has(provider as ProviderId)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  // Closed by default: minting a key to the books requires an admin session.
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }

  const state = randomBytes(32).toString("hex");
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  // sameSite "lax" (not strict) so the cookie survives the top-level redirect back from the provider.
  const cookieOpts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: STATE_TTL };

  jar.set(`oauth_state_${provider}`, state, cookieOpts);

  if (provider === "gmail") {
    const account = req.nextUrl.searchParams.get("account");
    if (!account) {
      return NextResponse.json({ error: "gmail requires ?account=<box address>" }, { status: 400 });
    }
    jar.set("oauth_account_gmail", account, cookieOpts);
  }

  // single-account providers: the connection key is fixed, stash it for the callback
  if (provider === "docusign" || provider === "gbp") {
    jar.set(`oauth_account_${provider}`, "default", cookieOpts);
  }

  // Microsoft: account is the tenant ID (or "common" if multi-tenant). We carry it through via cookie
  // so the callback can persist the connection keyed on the tenant.
  if (provider === "microsoft") {
    const tenant = process.env.MS_TENANT_ID ?? "common";
    jar.set("oauth_account_microsoft", tenant, cookieOpts);
  }

  return NextResponse.redirect(await getAuthorizeUrl(provider as ProviderId, state));
}
