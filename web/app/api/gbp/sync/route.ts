import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncGbp } from "@/lib/gbp";

// POST /api/gbp/sync — Pull Business Profile reviews.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncGbp();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
