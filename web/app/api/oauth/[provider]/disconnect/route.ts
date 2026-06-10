import { NextResponse, type NextRequest } from "next/server";
import { accountsForProvider, disconnect, type ProviderId } from "@/lib/oauth";
import { requireRole } from "@/lib/auth";

// GET /api/oauth/<provider>/disconnect — revoke the token at the provider and forget the connection.
// Admin-gated like /start: forgetting a key to the books is an admin action. Disconnects EVERY
// account for the provider (QB has one realm, but we never assume that) and lands back on the
// Integrations page with an ?oauth status the UI already knows how to render.
//
// GET (not POST) to match the existing OAuth-lifecycle routes and so this URL can also serve as the
// Intuit "Disconnect URL" landing. The CSRF surface is intentionally low-stakes: the worst a forged
// request does is force an admin to reconnect — the connection is read-only, nothing is destroyed.

const PROVIDERS = new Set<ProviderId>(["quickbooks", "gmail", "microsoft"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.has(provider as ProviderId)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }

  const done = (status: string) => {
    const u = new URL("/integrations", req.url);
    u.searchParams.set("oauth", status); // e.g. disconnected:quickbooks | error:disconnect_failed
    return NextResponse.redirect(u);
  };

  try {
    const accounts = await accountsForProvider(provider as ProviderId);
    for (const account of accounts) {
      await disconnect(provider as ProviderId, account);
    }
  } catch {
    return done("error:disconnect_failed");
  }

  return done(`disconnected:${provider}`);
}
