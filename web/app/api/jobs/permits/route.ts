import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createPermit, getPermits, updatePermit, getUpcomingInspections, OpsError } from "@/lib/operations";

// GET /api/jobs/permits?project=<id>     — permits for one project
// GET /api/jobs/permits?upcoming=1       — upcoming inspections across all projects
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  if (sp.get("upcoming")) {
    const days = parseInt(sp.get("days") ?? "14", 10) || 14;
    const rows = await getUpcomingInspections(days);
    return NextResponse.json({ inspections: rows });
  }
  const projectId = sp.get("project");
  if (!projectId) return NextResponse.json({ error: "project or upcoming required" }, { status: 400 });
  const rows = await getPermits(projectId);
  return NextResponse.json({ permits: rows });
}

// POST /api/jobs/permits — create a new permit record
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || !body.permit_type) {
    return NextResponse.json({ error: "project_id, permit_type required" }, { status: 400 });
  }
  const id = await createPermit({ ...body, created_by: user.name });
  return NextResponse.json({ ok: true, id });
}

// PATCH /api/jobs/permits — update permit (inspection result, dates)
export async function PATCH(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id, ...updates } = body;
  try {
    await updatePermit(id, updates, user.name);
  } catch (e) {
    if (e instanceof OpsError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
