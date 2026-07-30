import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectsList } from "@/lib/queries";
import { updateProjectOps, normalizeCompletion, OpsError } from "@/lib/operations";

export async function GET() {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await projectsList());
}

// Same slug shape as the estimate-accept path (app/api/estimates/accept/route.ts) so ids stay
// consistent whichever door a project comes in through.
function slug(s: string): string {
  return (s || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project";
}

// POST /api/projects — create a job by hand.
//
// Until now a project could only exist as a side effect of accepting a won estimate, so anything
// that started as a handshake had to be back-filled in SQL. Editor-gated and audited like every
// other mutation: the row insert and its audit_log entry share one transaction, then optional ops
// fields go through updateProjectOps so each one gets its own audit row.
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 401 });

  const d = await req.json().catch(() => ({}));
  const name: string = String(d.name ?? "").trim();
  if (!name) return Response.json({ error: "Project name is required" }, { status: 400 });

  const status: string = String(d.status ?? "Active").trim() || "Active";
  const type: string = String(d.type ?? "").trim() || "Unclassified";
  const market: string = String(d.market ?? "").trim() || "Oxford";

  // Validate before anything is written — a bad percentage should reject the whole request, not
  // leave a half-made project behind.
  let completion: number | null;
  try {
    completion = d.completion_pct === "" || d.completion_pct == null ? null : normalizeCompletion(d.completion_pct);
  } catch (e) {
    return Response.json({ error: e instanceof OpsError ? e.message : "bad completion_pct" }, { status: 400 });
  }

  // Bare slug first so hand-made ids stay readable (davis-ross, lou-johnson). Only fall back to a
  // uuid suffix when that id is taken — two "Porch Project" jobs shouldn't collide.
  const base = slug(name);
  const taken = (await db.execute({ sql: "SELECT id FROM projects WHERE id = ?", args: [base] })).rows.length > 0;
  const projectId = taken ? `${base}-${crypto.randomUUID().slice(0, 8)}` : base;

  const now = new Date().toISOString();
  const lastActivity = now.slice(0, 7); // YYYY-MM, the shape the rest of the app reads

  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO projects (id, name, type, market, status, last_activity) VALUES (?, ?, ?, ?, ?, ?)",
      args: [projectId, name, type, market, status, lastActivity],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'project', ?, ?, 'status', NULL, ?, 'create')`,
      args: [now, user.name, projectId, name, status],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  // Optional extras — each lands as its own audit row via the ops path.
  await updateProjectOps(
    projectId,
    {
      client_name: String(d.client_name ?? "").trim() || undefined,
      client_phone: String(d.client_phone ?? "").trim() || undefined,
      address: String(d.address ?? "").trim() || undefined,
      completion_pct: completion ?? undefined,
    },
    user.name,
  );

  return Response.json({ ok: true, id: projectId });
}
