import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncDocusign } from "@/lib/docusign";

// POST /api/docusign/sync — Pull envelope statuses, auto-file completed signed PDFs.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncDocusign();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
