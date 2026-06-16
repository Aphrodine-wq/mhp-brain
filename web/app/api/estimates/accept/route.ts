import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchProject } from "@/lib/match-project";
import { updateProjectOps } from "@/lib/operations";

// POST /api/estimates/accept — turn a won estimate into a tracked job.
// Matches an existing project by name; if none, creates a new app-side project row. Sets the
// contract value (+ a default 20% deposit) through the audited ops path, marks the estimate won,
// and links it. Editor-gated, same as the other job mutations (see AGENTS.md write-back contract).

function slug(s: string): string {
  return (s || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project";
}

// self-heal the link column if migration 010 hasn't been applied — idempotent, matches the
// runtime-ensure pattern the integrations use (e.g. trello.ensureCards).
async function ensureLinkColumn() {
  try {
    await db.execute("ALTER TABLE saved_estimates ADD COLUMN IF NOT EXISTS project_id TEXT");
  } catch { /* column already present */ }
}

export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 401 });

  const d = await req.json();
  const name: string = (d.project || "").trim();
  if (!name) return Response.json({ error: "project name required" }, { status: 400 });
  const bid = Number(d.bid) || 0;
  const deposit = d.deposit != null ? Number(d.deposit) : Math.round(bid * 0.2);

  // 1. match an existing job by name, else mint a new project row (only `name` is NOT NULL).
  const projects = (await db.execute("SELECT id, name FROM projects")).rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  let projectId = matchProject(projects, name)?.id ?? null;
  let created = false;
  if (!projectId) {
    projectId = `${slug(name)}-${crypto.randomUUID().slice(0, 8)}`;
    await db.execute({
      sql: "INSERT INTO projects (id, name, type, market, status) VALUES (?, ?, ?, ?, ?)",
      args: [projectId, name, null, null, "Active"],
    });
    created = true;
  }

  // 2. write contract value + deposit + phase through the audited ops path.
  await updateProjectOps(
    projectId,
    {
      contract_value: bid || null,
      deposit_amount: deposit || null,
      current_phase: "in_progress",
      client_name: d.clientName || null,
      address: d.address || null,
    },
    user.name,
  );

  // 3. record the estimate as won and link it (upsert so an unsaved estimate is captured too).
  await ensureLinkColumn();
  const now = new Date().toISOString();
  const id = d.savedId || `${slug(name)}-${crypto.randomUUID().slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO saved_estimates
            (id, project, client_name, address, est_date, status, markup, total, lines, project_id, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'won', ?, ?, ?::jsonb, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status = 'won', project_id = excluded.project_id, total = excluded.total, updated_at = excluded.updated_at`,
    args: [
      id, name, d.clientName || null, d.address || null, d.estDate || null,
      Number(d.markup) || 18, bid, JSON.stringify(d.lines ?? []), projectId,
      user.email, now, now,
    ],
  });

  return Response.json({ ok: true, projectId, created });
}
