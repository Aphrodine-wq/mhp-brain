import { logTime } from "@/lib/time";
import { requireRole } from "@/lib/auth";

// Log a crew member's hours against a job. Editor+ only; audit actor is the
// signed-in user (never trusted from the body).
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 403 });
  let d;
  try {
    d = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const actor = user.name.slice(0, 60);
  try {
    const id = await logTime(
      {
        worker_name: String(d.worker_name ?? ""),
        project_id: String(d.project_id ?? ""),
        work_date: String(d.work_date ?? ""),
        hours: Number(d.hours),
        source: d.source === "field" ? "field" : "office",
        note: d.note ? String(d.note) : undefined,
      },
      actor,
    );
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
