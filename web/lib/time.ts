// Native time tracking — the spine that replaces BusyBusy. One time_entries table
// feeds both payroll (hours by worker) and job costing / estimate-vs-actual (hours
// by job). Phase 1 is office/foreman entry; field self-punch (Phase 3) writes the
// same table. Mutations follow the write-back contract: server-side actor, audit
// row, single transaction (see lib/operations.ts for the precedent).
import { db } from "@/lib/db";

export interface Worker {
  id: number;
  name: string;
  role: string | null;
  pay_rate: number | null;
  active: number;
}

export async function listWorkers(includeInactive = false): Promise<Worker[]> {
  const rows = (
    await db.execute({
      sql: `SELECT id, name, role, pay_rate, active FROM workers
            ${includeInactive ? "" : "WHERE active = 1"} ORDER BY name`,
      args: [],
    })
  ).rows;
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    role: (r.role as string | null) ?? null,
    pay_rate: r.pay_rate == null ? null : Number(r.pay_rate),
    active: Number(r.active),
  }));
}

export async function addWorker(
  input: { name: string; role?: string; pay_rate?: number },
  actor: string,
): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error("worker name required");
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const res = await tx.execute({
      sql: `INSERT INTO workers (name, role, pay_rate, created_at)
            VALUES (?, ?, ?, now()::text) RETURNING id`,
      args: [name, input.role ?? null, input.pay_rate ?? null],
    });
    const id = Number(res.rows[0].id);
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'worker', ?, ?, 'name', '', ?, 'create')`,
      args: [now, actor, String(id), name, name],
    });
    await tx.commit();
    return id;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export interface TimeEntryInput {
  worker_id: number;
  project_id: string;
  work_date: string; // YYYY-MM-DD
  hours: number;
  source?: "office" | "field";
  note?: string;
}

export async function logTime(input: TimeEntryInput, actor: string): Promise<number> {
  if (!(input.hours > 0)) throw new Error("hours must be positive");
  if (!input.project_id) throw new Error("project_id required");
  if (!input.work_date) throw new Error("work_date required");
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const res = await tx.execute({
      sql: `INSERT INTO time_entries (worker_id, project_id, work_date, hours, source, note, entered_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
      args: [
        input.worker_id, input.project_id, input.work_date, input.hours,
        input.source ?? "office", input.note ?? null, actor,
      ],
    });
    const id = Number(res.rows[0].id);
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'time_entry', ?, ?, 'hours', '', ?, 'create')`,
      args: [now, actor, String(id), `${input.project_id} ${input.work_date}`, String(input.hours)],
    });
    await tx.commit();
    return id;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// --- Readouts: the two outputs that justify the build ----------------------

// Payroll view: total hours (and $ where a pay_rate exists) per active worker
// over a date window. This is what replaces BusyBusy for paying people.
export async function hoursByWorker(from: string, to: string) {
  return (
    await db.execute({
      sql: `SELECT w.id, w.name, w.pay_rate,
                   COALESCE(SUM(te.hours), 0) AS hours,
                   COALESCE(SUM(te.hours * COALESCE(w.pay_rate, 0)), 0) AS pay
            FROM workers w
            LEFT JOIN time_entries te
              ON te.worker_id = w.id AND te.work_date >= ? AND te.work_date <= ?
            WHERE w.active = 1
            GROUP BY w.id, w.name, w.pay_rate
            ORDER BY hours DESC`,
      args: [from, to],
    })
  ).rows;
}

// Job-costing view: total actual labor hours per job — the input to the
// estimate-vs-actual loop (Phase 2).
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
