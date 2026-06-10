import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncTrello } from "@/lib/trello";

// POST /api/trello/sync — pull boards/lists/cards, match cards to projects by name.
// Idempotent upserts keyed by card id.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncTrello();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
