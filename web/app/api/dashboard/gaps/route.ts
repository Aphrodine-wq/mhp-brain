import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getOperationalGaps } from "@/lib/operations";

// GET /api/dashboard/gaps — active jobs missing operational data (CEO cockpit)
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  const gaps = await getOperationalGaps();
  return NextResponse.json({ gaps });
}
