import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncTwilio } from "@/lib/twilio";

// POST /api/twilio/sync — Pull SMS + call logs, match numbers to subs and crew.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncTwilio();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
