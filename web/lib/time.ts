// Native time tracking — the spine that replaces BusyBusy. One time_entries table
// feeds both payroll (hours by worker) and job costing / estimate-vs-actual (hours
// by job). Workers come from the existing crew roster (lib/queries crewList) — we
// store the name, not a FK to a duplicate roster. Phase 1 is office/foreman entry;
// field self-punch (Phase 3) writes the same table. Mutations follow the write-back
// contract: server-side actor, audit row, single transaction (cf. lib/operations.ts).
import { db } from "@/lib/db";

export interface TimeEntryInput {
  worker_name: string;
  project_id: string;
  work_date: string; // YYYY-MM-DD
  hours: number;
  source?: "office" | "field";
  note?: string;
}

export async function logTime(input: TimeEntryInput, actor: string): Promise<number> {
  const worker = input.worker_name.trim();
  if (!worker) throw new Error("worker required");
  if (!input.project_id) throw new Error("project required");
  if (!input.work_date) throw new Error("work date required");
  if (!(input.hours > 0)) throw new Error("hours must be positive");
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const res = await tx.execute({
      sql: `INSERT INTO time_entries (worker_name, project_id, work_date, hours, source, note, entered_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
      args: [
        worker, input.project_id, input.work_date, input.hours,
        input.source ?? "office", input.note ?? null, actor,
      ],
    });
    const id = Number(res.rows[0].id);
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'time_entry', ?, ?, 'hours', '', ?, 'create')`,
      args: [now, actor, String(id), `${worker} · ${input.project_id} · ${input.work_date}`, String(input.hours)],
    });
    await tx.commit();
    return id;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export interface RecentEntry {
  id: number;
  worker_name: string;
  project_id: string;
  project_name: string;
  work_date: string;
  hours: number;
  note: string | null;
}

export async function recentEntries(limit = 30): Promise<RecentEntry[]> {
  const rows = (
    await db.execute({
      sql: `SELECT te.id, te.worker_name, te.project_id, p.name AS project_name,
                   te.work_date, te.hours, te.note
            FROM time_entries te JOIN projects p ON te.project_id = p.id
            ORDER BY te.work_date DESC, te.created_at DESC LIMIT ?`,
      args: [limit],
    })
  ).rows;
  return rows.map((r) => ({
    id: Number(r.id),
    worker_name: String(r.worker_name),
    project_id: String(r.project_id),
    project_name: String(r.project_name ?? ""),
    work_date: String(r.work_date),
    hours: Number(r.hours),
    note: (r.note as string | null) ?? null,
  }));
}

// --- Readouts: the two outputs that justify the build ----------------------

// Payroll view: total hours per worker over a date window. (Pay $ comes later
// from the crew roster's rates — Phase 1 tracks hours.)
export async function hoursByWorker(from: string, to: string) {
  return (
    await db.execute({
      sql: `SELECT worker_name, COALESCE(SUM(hours), 0) AS hours, COUNT(*) AS entries
            FROM time_entries WHERE work_date >= ? AND work_date <= ?
            GROUP BY worker_name ORDER BY hours DESC`,
      args: [from, to],
    })
  ).rows;
}

// Job-costing view: total actual labor hours per job — "track by project," the
// input to the estimate-vs-actual loop (Phase 2).
export async function hoursByJob(projectId?: string) {
  if (projectId) {
    return (
      await db.execute({
        sql: `SELECT project_id, COALESCE(SUM(hours), 0) AS hours, COUNT(*) AS entries
              FROM time_entries WHERE project_id = ? GROUP BY project_id`,
        args: [projectId],
      })
    ).rows;
  }
  return (
    await db.execute({
      sql: `SELECT te.project_id, p.name AS project_name,
                   COALESCE(SUM(te.hours), 0) AS hours, COUNT(*) AS entries
            FROM time_entries te JOIN projects p ON te.project_id = p.id
            GROUP BY te.project_id, p.name ORDER BY hours DESC`,
      args: [],
    })
  ).rows;
}

// Phase 2 hook: actual labor hours clocked against one job, to set beside the
// estimated labor hours from that job's line items.
export async function actualLaborHours(projectId: string): Promise<number> {
  const r = (
    await db.execute({
      sql: `SELECT COALESCE(SUM(hours), 0) AS hours FROM time_entries WHERE project_id = ?`,
      args: [projectId],
    })
  ).rows[0];
  return Number(r?.hours ?? 0);
}
