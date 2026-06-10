import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncOneDrive } from "@/lib/onedrive";

// POST /api/onedrive/sync — crawl the connected OneDrive for business paperwork and pull
// it into the documents store. Idempotent: Graph delta links + per-item source refs mean
// repeat calls only touch new or changed files.
export async function POST() {
  if (!(await requireRole("ceo"))) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }
  try {
    const result = await syncOneDrive();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
