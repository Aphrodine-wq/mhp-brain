import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, type ProviderId } from "@/lib/oauth";

// Step 2: the provider redirects here with ?code & ?state (QB also ?realmId).
// The state cookie match is this route's primary guard (CSRF) — we never trust ?state alone.

const PROVIDERS = new Set<ProviderId>(["quickbooks", "gmail", "microsoft", "docusign", "gbp"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.has(provider as ProviderId)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const done = (status: string) => {
    const u = new URL("/integrations", req.url);
    u.searchParams.set("oauth", status); // e.g. connected:gmail | error:state_mismatch
    return NextResponse.redirect(u);
  };

  // Provider-side refusal (user clicked Deny, scope rejected, etc.).
  const providerError = sp.get("error");
  if (providerError) return done(`error:${providerError}`);

  const code = sp.get("code");
  const state = sp.get("state");
  const jar = await cookies();
  const expected = jar.get(`oauth_state_${provider}`)?.value;

  if (!code || !state || !expected || state !== expected) {
    return done("error:state_mismatch");
  }
  jar.delete(`oauth_state_${provider}`);

  // Resolve the account key: QB hands back the realmId; Gmail's box address we stashed at start;
  // Microsoft's tenant we stashed at start.
  let account: string | null;
  let realmId: string | undefined;
  if (provider === "quickbooks") {
    realmId = sp.get("realmId") ?? undefined;
    account = realmId ?? null;
  } else {
    // gmail/microsoft/docusign/gbp all stashed their account key at /start
    account = jar.get(`oauth_account_${provider}`)?.value ?? null;
    jar.delete(`oauth_account_${provider}`);
  }
  if (!account) return done("error:missing_account");

  // redirect() stays outside the try: NextResponse.redirect doesn't throw, so this is already safe.
  try {
    await exchangeCode(provider as ProviderId, { code, account, realmId });
  } catch {
    return done("error:exchange_failed");
  }

  return done(`connected:${provider}`);
}
