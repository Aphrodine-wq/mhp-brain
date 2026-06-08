import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getCallbackPatterns } from "@/lib/operations";

// GET /api/callbacks/patterns?min=3 — recurring warranty issues across jobs
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  const min = parseInt(req.nextUrl.searchParams.get("min") ?? "3", 10) || 3;
  const patterns = await getCallbackPatterns(min);
  return NextResponse.json({ patterns });
}
