// Operational context: everything the pricing brain is blind to.
// CRUD for change orders, job events, photos, permits, callbacks, sub assignments, payments,
// and project operational fields (lead source, dates, phase, client info).

import { db } from "@/lib/db";

export class OpsError extends Error {}

// Allowlisted, audited dynamic UPDATE. Column names only ever come from the
// `allowed` set (never the request body), old values are captured first, and the
// whole field loop + audit rows commit as one transaction — same contract as
// writeOverride() in overrides.ts.
async function auditedUpdate(opts: {
  table: string;
  entityType: string;
  id: string | number;
  idCol?: string;
  updates: Record<string, unknown>;
  allowed: ReadonlySet<string>;
  actor: string;
  label?: string | null;
  action?: string;
}): Promise<void> {
  const fields = Object.entries(opts.updates).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return;
  for (const [field] of fields) {
    if (!opts.allowed.has(field)) throw new OpsError(`bad field ${opts.entityType}.${field}`);
  }
  const idCol = opts.idCol ?? "id";
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const cur = await tx.execute({
      sql: `SELECT ${fields.map(([f]) => f).join(", ")} FROM ${opts.table} WHERE ${idCol} = ?`,
      args: [opts.id],
    });
    if (cur.rows.length === 0) throw new OpsError(`${opts.entityType} ${opts.id} not found`);
    const old = cur.rows[0];
    for (const [field, value] of fields) {
      await tx.execute({
        sql: `UPDATE ${opts.table} SET ${field} = ? WHERE ${idCol} = ?`,
        args: [value, opts.id],
      });
      await tx.execute({
        sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [now, opts.actor, opts.entityType, String(opts.id), opts.label ?? null, field,
               old[field] == null ? null : String(old[field]), value == null ? null : String(value),
               opts.action ?? "update"],
      });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Project operational fields
// ---------------------------------------------------------------------------

export interface ProjectUpdate {
  lead_source?: string | null;
  lost_reason?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  current_phase?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  address?: string | null;
  contract_value?: number | null;
  deposit_amount?: number | null;
  deposit_date?: string | null;
}

const PROJECT_OPS_FIELDS: ReadonlySet<string> = new Set([
  "lead_source", "lost_reason", "actual_start", "actual_end", "current_phase",
  "client_name", "client_phone", "client_email", "address",
  "contract_value", "deposit_amount", "deposit_date",
]);

export async function updateProjectOps(projectId: string, updates: ProjectUpdate, actor: string): Promise<void> {
  await auditedUpdate({
    table: "projects", entityType: "project", id: projectId,
    updates: updates as Record<string, unknown>, allowed: PROJECT_OPS_FIELDS, actor,
  });
}

export async function getProjectOps(projectId: string) {
  const row = (await db.execute({
    sql: `SELECT lead_source, lost_reason, actual_start, actual_end, current_phase,
                 client_name, client_phone, client_email, address,
                 contract_value, deposit_amount, deposit_date
          FROM projects WHERE id = ?`,
    args: [projectId],
  })).rows[0];
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Change Orders
// ---------------------------------------------------------------------------

export interface ChangeOrderInsert {
  project_id: string;
  description: string;
  amount: number;
  requested_by?: string;
  notes?: string;
  created_by?: string;
}

export async function createChangeOrder(co: ChangeOrderInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO change_orders (project_id, description, amount, requested_by, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [co.project_id, co.description, co.amount, co.requested_by ?? null, co.notes ?? null, co.created_by ?? null],
  });
  return Number(res.rows[0].id);
}

export async function approveChangeOrder(id: number, approved: 1 | -1, actor: string): Promise<void> {
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const cur = await tx.execute({ sql: `SELECT approved, description FROM change_orders WHERE id = ?`, args: [id] });
    if (cur.rows.length === 0) throw new OpsError(`change order ${id} not found`);
    await tx.execute({
      sql: `UPDATE change_orders SET approved = ?, approved_date = ? WHERE id = ?`,
      args: [approved, now, id],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'change_order', ?, ?, 'approved', ?, ?, ?)`,
      args: [now, actor, String(id), String(cur.rows[0].description ?? ""),
             String(cur.rows[0].approved ?? "0"), String(approved),
             approved === 1 ? "approve" : "reject"],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function billChangeOrder(id: number, actor: string): Promise<void> {
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const cur = await tx.execute({ sql: `SELECT billed, description FROM change_orders WHERE id = ?`, args: [id] });
    if (cur.rows.length === 0) throw new OpsError(`change order ${id} not found`);
    await tx.execute({
      sql: `UPDATE change_orders SET billed = 1, billed_date = ? WHERE id = ?`,
      args: [now, id],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'change_order', ?, ?, 'billed', ?, '1', 'bill')`,
      args: [now, actor, String(id), String(cur.rows[0].description ?? ""), String(cur.rows[0].billed ?? "0")],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function getChangeOrders(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM change_orders WHERE project_id = ? ORDER BY created_at DESC`,
    args: [projectId],
  })).rows;
}

// ---------------------------------------------------------------------------
// Job Events (daily logs, phone calls, site visits, decisions)
// ---------------------------------------------------------------------------

export interface JobEventInsert {
  project_id: string;
  event_type: string;
  event_date: string;
  summary: string;
  detail?: string;
  crew_present?: string;
  hours_worked?: number;
  weather?: string;
  action_items?: string;
  logged_by?: string;
}

export async function createJobEvent(ev: JobEventInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO job_events (project_id, event_type, event_date, summary, detail,
                                  crew_present, hours_worked, weather, action_items, logged_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [
      ev.project_id, ev.event_type, ev.event_date, ev.summary, ev.detail ?? null,
      ev.crew_present ?? null, ev.hours_worked ?? null, ev.weather ?? null,
      ev.action_items ?? null, ev.logged_by ?? null,
    ],
  });
  return Number(res.rows[0].id);
}

export async function getJobEvents(projectId: string, limit = 50) {
  return (await db.execute({
    sql: `SELECT * FROM job_events WHERE project_id = ? ORDER BY event_date DESC, created_at DESC LIMIT ?`,
    args: [projectId, limit],
  })).rows;
}

export async function getRecentEvents(limit = 30) {
  return (await db.execute({
    sql: `SELECT je.*, p.name AS project_name
          FROM job_events je JOIN projects p ON je.project_id = p.id
          ORDER BY je.event_date DESC, je.created_at DESC LIMIT ?`,
    args: [limit],
  })).rows;
}

// ---------------------------------------------------------------------------
// Job Photos
// ---------------------------------------------------------------------------

export interface PhotoInsert {
  project_id: string;
  file_path?: string;
  file_url?: string;
  phase?: string;
  caption?: string;
  taken_at?: string;
  uploaded_by?: string;
}

export async function createPhoto(p: PhotoInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO job_photos (project_id, file_path, file_url, phase, caption, taken_at, uploaded_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [p.project_id, p.file_path ?? null, p.file_url ?? null, p.phase ?? null,
           p.caption ?? null, p.taken_at ?? null, p.uploaded_by ?? null],
  });
  return Number(res.rows[0].id);
}

export async function getPhotos(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM job_photos WHERE project_id = ? ORDER BY taken_at DESC NULLS LAST, created_at DESC`,
    args: [projectId],
  })).rows;
}

// ---------------------------------------------------------------------------
// Permits & Inspections
// ---------------------------------------------------------------------------

export interface PermitInsert {
  project_id: string;
  permit_type: string;
  permit_number?: string;
  applied_date?: string;
  approved_date?: string;
  expires_date?: string;
  inspection_date?: string;
  inspection_result?: string;
  notes?: string;
  created_by?: string;
}

export async function createPermit(p: PermitInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO permits (project_id, permit_type, permit_number, applied_date, approved_date,
                               expires_date, inspection_date, inspection_result, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [
      p.project_id, p.permit_type, p.permit_number ?? null, p.applied_date ?? null,
      p.approved_date ?? null, p.expires_date ?? null, p.inspection_date ?? null,
      p.inspection_result ?? null, p.notes ?? null, p.created_by ?? null,
    ],
  });
  return Number(res.rows[0].id);
}

const PERMIT_FIELDS: ReadonlySet<string> = new Set([
  "permit_type", "permit_number", "applied_date", "approved_date",
  "expires_date", "inspection_date", "inspection_result", "notes",
]);

export async function updatePermit(id: number, updates: Partial<PermitInsert>, actor: string): Promise<void> {
  await auditedUpdate({
    table: "permits", entityType: "permit", id,
    updates: updates as Record<string, unknown>, allowed: PERMIT_FIELDS, actor,
  });
}

export async function getPermits(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM permits WHERE project_id = ? ORDER BY applied_date DESC NULLS LAST`,
    args: [projectId],
  })).rows;
}

export async function getUpcomingInspections(daysAhead = 14) {
  return (await db.execute({
    sql: `SELECT pm.*, p.name AS project_name FROM permits pm
          JOIN projects p ON pm.project_id = p.id
          WHERE pm.inspection_result = 'pending'
            AND pm.inspection_date IS NOT NULL
            AND pm.inspection_date <= (CURRENT_DATE + ? * INTERVAL '1 day')::text
          ORDER BY pm.inspection_date`,
    args: [daysAhead],
  })).rows;
}

// ---------------------------------------------------------------------------
// Warranty Callbacks
// ---------------------------------------------------------------------------

export interface CallbackInsert {
  project_id: string;
  reported_date: string;
  issue: string;
  cause?: string;
  category?: string;
  covered?: number;
  resolution?: string;
  resolved_date?: string;
  cost_to_fix?: number;
  logged_by?: string;
}

export async function createCallback(cb: CallbackInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO callbacks (project_id, reported_date, issue, cause, category, covered,
                                 resolution, resolved_date, cost_to_fix, logged_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [
      cb.project_id, cb.reported_date, cb.issue, cb.cause ?? null, cb.category ?? null,
      cb.covered ?? 1, cb.resolution ?? null, cb.resolved_date ?? null,
      cb.cost_to_fix ?? null, cb.logged_by ?? null,
    ],
  });
  return Number(res.rows[0].id);
}

export async function resolveCallback(id: number, resolution: string, cost: number | null, actor: string): Promise<void> {
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const cur = await tx.execute({ sql: `SELECT issue, resolution FROM callbacks WHERE id = ?`, args: [id] });
    if (cur.rows.length === 0) throw new OpsError(`callback ${id} not found`);
    await tx.execute({
      sql: `UPDATE callbacks SET resolution = ?, resolved_date = ?, cost_to_fix = ? WHERE id = ?`,
      args: [resolution, now, cost, id],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'callback', ?, ?, 'resolution', ?, ?, 'resolve')`,
      args: [now, actor, String(id), String(cur.rows[0].issue ?? ""),
             cur.rows[0].resolution == null ? null : String(cur.rows[0].resolution), resolution],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function getCallbacks(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM callbacks WHERE project_id = ? ORDER BY reported_date DESC`,
    args: [projectId],
  })).rows;
}

// Pattern detection: categories that recur across multiple jobs.
export async function getCallbackPatterns(minCount = 3) {
  return (await db.execute({
    sql: `SELECT category, issue, COUNT(*) AS occurrences,
                 COUNT(DISTINCT project_id) AS jobs_affected,
                 SUM(cost_to_fix) AS total_cost
          FROM callbacks
          WHERE category IS NOT NULL
          GROUP BY category, issue
          HAVING COUNT(*) >= ?
          ORDER BY occurrences DESC`,
    args: [minCount],
  })).rows;
}

// ---------------------------------------------------------------------------
// Sub Assignments
// ---------------------------------------------------------------------------

export interface SubAssignmentInsert {
  project_id: string;
  sub_name: string;
  trade?: string;
  scheduled_date?: string;
  quoted_amount?: number;
  notes?: string;
  created_by?: string;
}

export async function createSubAssignment(sa: SubAssignmentInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO sub_assignments (project_id, sub_name, trade, scheduled_date,
                                       quoted_amount, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [
      sa.project_id, sa.sub_name, sa.trade ?? null, sa.scheduled_date ?? null,
      sa.quoted_amount ?? null, sa.notes ?? null, sa.created_by ?? null,
    ],
  });
  return Number(res.rows[0].id);
}

const SUB_ASSIGNMENT_FIELDS: ReadonlySet<string> = new Set([
  "showed_up", "actual_amount", "performance", "notes", "scheduled_date", "trade",
]);

export async function updateSubAssignment(
  id: number,
  updates: { showed_up?: number; actual_amount?: number; performance?: number; notes?: string; scheduled_date?: string; trade?: string },
  actor: string,
): Promise<void> {
  await auditedUpdate({
    table: "sub_assignments", entityType: "sub_assignment", id,
    updates: updates as Record<string, unknown>, allowed: SUB_ASSIGNMENT_FIELDS, actor,
  });
}

export async function getSubAssignments(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM sub_assignments WHERE project_id = ? ORDER BY scheduled_date DESC NULLS LAST`,
    args: [projectId],
  })).rows;
}

// Sub reliability: show rate and average performance across all jobs.
export async function getSubScorecard(subName: string) {
  return (await db.execute({
    sql: `SELECT sub_name,
                 COUNT(*) AS total_assignments,
                 SUM(CASE WHEN showed_up = 1 THEN 1 ELSE 0 END) AS showed_up_count,
                 SUM(CASE WHEN showed_up = 0 THEN 1 ELSE 0 END) AS no_show_count,
                 ROUND(AVG(performance), 1) AS avg_performance,
                 SUM(quoted_amount) AS total_quoted,
                 SUM(actual_amount) AS total_actual
          FROM sub_assignments WHERE sub_name = ?
          GROUP BY sub_name`,
    args: [subName],
  })).rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentInsert {
  project_id: string;
  amount: number;
  payment_date: string;
  method?: string;
  payment_type?: string;
  reference?: string;
  notes?: string;
  recorded_by?: string;
}

export async function createPayment(p: PaymentInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO payments (project_id, amount, payment_date, method, payment_type,
                                reference, notes, recorded_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [
      p.project_id, p.amount, p.payment_date, p.method ?? null,
      p.payment_type ?? null, p.reference ?? null, p.notes ?? null, p.recorded_by ?? null,
    ],
  });
  return Number(res.rows[0].id);
}

export async function getPayments(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM payments WHERE project_id = ? ORDER BY payment_date DESC`,
    args: [projectId],
  })).rows;
}

export async function getPaymentSummary(projectId: string) {
  return (await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS total_collected,
                 COUNT(*) AS payment_count,
                 MAX(payment_date) AS last_payment_date
          FROM payments WHERE project_id = ?`,
    args: [projectId],
  })).rows[0];
}

// Cross-job cash flow: total in vs total out over a date range.
export async function getCashFlow(startDate: string, endDate: string) {
  return (await db.execute({
    sql: `SELECT payment_date, SUM(amount) AS daily_total, COUNT(*) AS txn_count
          FROM payments
          WHERE payment_date >= ? AND payment_date <= ?
          GROUP BY payment_date
          ORDER BY payment_date`,
    args: [startDate, endDate],
  })).rows;
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// User administration (admin-only — activate pending sign-ups, assign roles)
// ---------------------------------------------------------------------------

// The live role set (matches the users_role_check constraint, migration 007).
export const USER_ROLES = [
  "admin", "ceo", "estimator", "sales", "materials", "editor", "viewer", "crew",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

const USER_ADMIN_FIELDS: ReadonlySet<string> = new Set(["role", "active"]);

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  active: number;
  created_at: string | null;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const rows = (await db.execute(
    `SELECT id, name, email, role, active, created_at FROM users ORDER BY active ASC, name`,
  )).rows;
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    email: String(r.email),
    role: String(r.role),
    active: Number(r.active),
    created_at: r.created_at == null ? null : String(r.created_at),
  }));
}

// Activate/deactivate or re-role a user. Goes through the same auditedUpdate contract
// as every other mutation, so each change appends an audit_log row. Field names come
// only from USER_ADMIN_FIELDS; the route validates the *values* (role ∈ USER_ROLES,
// active ∈ {0,1}) and blocks admin self-lockout before calling here. The audit label
// is the user's email, looked up server-side so it's authoritative, not client-supplied.
export async function updateUserAdmin(
  id: number,
  updates: { role?: UserRole; active?: 0 | 1 },
  actor: string,
): Promise<void> {
  const row = (await db.execute({ sql: `SELECT email FROM users WHERE id = ?`, args: [id] })).rows[0];
  if (!row) throw new OpsError(`user ${id} not found`);
  await auditedUpdate({
    table: "users", entityType: "user", id,
    updates: updates as Record<string, unknown>,
    allowed: USER_ADMIN_FIELDS, actor, label: String(row.email), action: "user_admin",
  });
}

// Jobs missing operational data — surfaces on the CEO cockpit.
export async function getOperationalGaps() {
  return (await db.execute(`
    SELECT p.id, p.name, p.status, p.current_phase,
           (p.actual_start IS NULL)::int AS missing_start_date,
           (p.client_phone IS NULL AND p.client_email IS NULL)::int AS missing_contact,
           (p.lead_source IS NULL)::int AS missing_lead_source,
           (SELECT COUNT(*) FROM job_events je WHERE je.project_id = p.id) AS event_count,
           (SELECT COUNT(*) FROM change_orders co WHERE co.project_id = p.id AND co.approved = 0) AS pending_cos,
           (SELECT COUNT(*) FROM permits pm WHERE pm.project_id = p.id AND pm.inspection_result = 'pending') AS pending_inspections,
           (SELECT COUNT(*) FROM callbacks cb WHERE cb.project_id = p.id AND cb.resolved_date IS NULL) AS open_callbacks
    FROM projects p
    WHERE p.status IN ('Active', 'active')
    ORDER BY p.name
  `)).rows;
}

// ---------------------------------------------------------------------------
// Invoices — vendor bills against a project (migration 012_invoices)
// ---------------------------------------------------------------------------

export interface InvoiceInsert {
  project_id: string;
  vendor: string;
  amount: number;
  invoice_date: string;
  notes?: string;
  source?: string;
  created_by?: string;
}

export async function createInvoice(i: InvoiceInsert): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO invoices (project_id, vendor, amount, invoice_date, notes, source, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now()::text) RETURNING id`,
    args: [
      i.project_id, i.vendor, i.amount, i.invoice_date,
      i.notes ?? null, i.source ?? "manual", i.created_by ?? null,
    ],
  });
  return Number(res.rows[0].id);
}

export async function getInvoices(projectId: string) {
  return (await db.execute({
    sql: `SELECT * FROM invoices WHERE project_id = ? ORDER BY invoice_date DESC`,
    args: [projectId],
  })).rows;
}

export async function getInvoiceTotal(projectId: string) {
  const row = (await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM invoices WHERE project_id = ?`,
    args: [projectId],
  })).rows[0];
  return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
}
