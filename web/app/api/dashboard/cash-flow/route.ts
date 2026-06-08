import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getCashFlow } from "@/lib/operations";

// GET /api/dashboard/cash-flow?start=2026-01-01&end=2026-12-31
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const start = sp.get("start");
  const end = sp.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end dates required" }, { status: 400 });

  const flow = await getCashFlow(start, end);
  return NextResponse.json({ cash_flow: flow });
}
