import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createPhoto, getPhotos } from "@/lib/operations";

// GET /api/jobs/photos?project=<id>
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("project");
  if (!projectId) return NextResponse.json({ error: "project required" }, { status: 400 });
  const rows = await getPhotos(projectId);
  return NextResponse.json({ photos: rows });
}

// POST /api/jobs/photos — register a photo (metadata only, file stays in OneDrive)
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  const id = await createPhoto({ ...body, uploaded_by: user.name });
  return NextResponse.json({ ok: true, id });
}
