import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { recomputeRates } from "@/lib/price-sensor";

// POST /api/pricing/run — recompute each tracked material's MHP rates (recent 12 months
// vs all-time medians) from estimate history. The in-app half of the price sensor.
export async function POST() {
  if (!(await requireRole("editor"))) return NextResponse.json({ error: "editor role required" }, { status: 403 });
  try {
    const result = await recomputeRates();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
