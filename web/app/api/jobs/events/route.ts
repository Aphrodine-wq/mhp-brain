import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createJobEvent, getJobEvents, getRecentEvents } from "@/lib/operations";

// GET /api/jobs/events?project=<id>&limit=50 — events for one project
// GET /api/jobs/events?recent=1&limit=30     — recent events across all projects
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("project");
  const limit = Math.min(parseInt(sp.get("limit") ?? "50", 10) || 50, 200);

  if (sp.get("recent")) {
    const rows = await getRecentEvents(limit);
    return NextResponse.json({ events: rows });
  }
  if (!projectId) return NextResponse.json({ error: "project or recent required" }, { status: 400 });
  const rows = await getJobEvents(projectId, limit);
  return NextResponse.json({ events: rows });
}

// POST /api/jobs/events — log a new event (daily log, phone call, site visit, decision)
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || !body.event_type || !body.event_date || !body.summary) {
    return NextResponse.json({ error: "project_id, event_type, event_date, summary required" }, { status: 400 });
  }
  const id = await createJobEvent({ ...body, logged_by: user.name });
  return NextResponse.json({ ok: true, id });
}
