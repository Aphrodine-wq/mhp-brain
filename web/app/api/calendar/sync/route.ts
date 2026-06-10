import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncCalendar } from "@/lib/calendar";

// POST /api/calendar/sync — pull the next 30 days of Outlook events, match to projects.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncCalendar();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
