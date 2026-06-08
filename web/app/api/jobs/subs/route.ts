import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createSubAssignment, getSubAssignments, updateSubAssignment, getSubScorecard } from "@/lib/operations";

// GET /api/jobs/subs?project=<id>    — sub assignments for a project
// GET /api/jobs/subs?scorecard=<name> — performance scorecard for a sub
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const subName = sp.get("scorecard");
  if (subName) {
    const scorecard = await getSubScorecard(subName);
    return NextResponse.json({ scorecard });
  }
  const projectId = sp.get("project");
  if (!projectId) return NextResponse.json({ error: "project or scorecard required" }, { status: 400 });
  const rows = await getSubAssignments(projectId);
  return NextResponse.json({ assignments: rows });
}

// POST /api/jobs/subs — assign a sub to a project
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || !body.sub_name) {
    return NextResponse.json({ error: "project_id, sub_name required" }, { status: 400 });
  }
  const id = await createSubAssignment({ ...body, created_by: user.name });
  return NextResponse.json({ ok: true, id });
}

// PATCH /api/jobs/subs — update assignment (showed_up, actual_amount, performance)
export async function PATCH(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id, ...updates } = body;
  await updateSubAssignment(id, updates);
  return NextResponse.json({ ok: true });
}
