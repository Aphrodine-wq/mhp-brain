import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncOpenPhone } from "@/lib/openphone";

// POST /api/openphone/sync — Pull OpenPhone texts + calls into the comms log.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncOpenPhone();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
