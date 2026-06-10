import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { saveConnection } from "@/lib/oauth/store";
import { trelloMe } from "@/lib/trello";

// POST /api/trello/connect {token} — the fragment-catcher page posts the member token
// here. We verify it against Trello, then store it like any other connection (encrypted,
// audited). Trello read tokens with expiration=never don't refresh — far-future expiry.
export async function POST(req: Request) {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  let token: string;
  try {
    token = String((await req.json()).token ?? "");
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9]{20,}$/.test(token)) return NextResponse.json({ error: "bad token" }, { status: 400 });

  try {
    const me = await trelloMe(token);
    await saveConnection({
      provider: "trello",
      account: me.username,
      realmId: null,
      accessToken: token,
      refreshToken: "",
      expiresAt: "2099-01-01T00:00:00.000Z", // never-expiring read token
      scope: "read",
    });
    return NextResponse.json({ ok: true, account: me.username });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
