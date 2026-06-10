import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncCompanyCam } from "@/lib/companycam";

// POST /api/companycam/sync — Pull CompanyCam projects + photo counts, match to jobs.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncCompanyCam();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
