import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { getProjectOps, updateProjectOps } from "@/lib/operations";

// GET /api/jobs/details?project=<id> — operational fields for a project
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("project");
  if (!projectId) return NextResponse.json({ error: "project required" }, { status: 400 });
  const data = await getProjectOps(projectId);
  return NextResponse.json({ data });
}

// PATCH /api/jobs/details — update operational fields
export async function PATCH(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  const { project_id, ...updates } = body;
  if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  await updateProjectOps(project_id, updates, user.name);
  return NextResponse.json({ ok: true });
}
