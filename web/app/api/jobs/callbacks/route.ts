import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createCallback, getCallbacks, resolveCallback } from "@/lib/operations";

// GET /api/jobs/callbacks?project=<id>
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("project");
  if (!projectId) return NextResponse.json({ error: "project required" }, { status: 400 });
  const rows = await getCallbacks(projectId);
  return NextResponse.json({ callbacks: rows });
}

// POST /api/jobs/callbacks — log a warranty callback
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || !body.reported_date || !body.issue) {
    return NextResponse.json({ error: "project_id, reported_date, issue required" }, { status: 400 });
  }
  const id = await createCallback({ ...body, logged_by: user.name });
  return NextResponse.json({ ok: true, id });
}

// PATCH /api/jobs/callbacks — resolve a callback
export async function PATCH(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.id || !body.resolution) {
    return NextResponse.json({ error: "id, resolution required" }, { status: 400 });
  }
  await resolveCallback(body.id, body.resolution, body.cost_to_fix ?? null);
  return NextResponse.json({ ok: true });
}
