import { db } from "@/lib/db";

// CLIENT-SAFE projection for the public job portal. This is the security boundary: every query
// here selects an EXPLICIT, client-safe column list — never SELECT *, never projectDetail, never a
// getter that pulls internal fields. Nothing about margin, cost, subs, line-item pricing, lead
// source, lost reason, crew, hours, or audit trail may appear in this file.

const PHASES = ["lead", "quoted", "scheduled", "in_progress", "complete", "paid", "warranty"] as const;
const PHASE_LABEL: Record<string, string> = {
  lead: "New", quoted: "Quoted", scheduled: "Scheduled", in_progress: "In progress",
  complete: "Complete", paid: "Paid", warranty: "Warranty",
};

export interface ClientPortalData {
  name: string;
  address: string | null;
  clientName: string | null;
  phase: string | null;        // raw phase key
  phaseLabel: string;          // friendly
  phaseIndex: number;          // for the stepper (-1 if unknown)
  phases: { key: string; label: string }[];
  startedAt: string | null;
  targetEnd: string | null;
  schedule: { label: string; amount: number; paid: boolean }[];
  collected: number;
  contractValue: number | null;
  changeOrders: { description: string; amount: number; approvedDate: string | null }[];
  nextInspection: { type: string; date: string; result: string | null } | null;
  milestones: { date: string; summary: string }[];
  photos: { url: string; caption: string | null }[];
}

export async function clientPortalData(projectId: string): Promise<ClientPortalData | null> {
  const proj = (await db.execute({
    sql: `SELECT name, address, client_name, current_phase, actual_start, actual_end, contract_value
          FROM projects WHERE id = ?`,
    args: [projectId],
  })).rows[0];
  if (!proj) return null;

  const contractValue = proj.contract_value != null ? Number(proj.contract_value) : null;

  // payments — amount + date only (no method/reference/notes)
  const pays = (await db.execute({
    sql: `SELECT amount, payment_date FROM payments WHERE project_id = ? ORDER BY payment_date ASC`,
    args: [projectId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }))).rows;
  const collected = pays.reduce((s, p) => s + Number(p.amount || 0), 0);

  // payment schedule derived from the contract (20% deposit / two draws / 5% final — same split as
  // the contract doc). A line is "paid" once cumulative collected covers it through that point.
  const schedule: ClientPortalData["schedule"] = [];
  if (contractValue && contractValue > 0) {
    const deposit = contractValue * 0.2;
    const final = contractValue * 0.05;
    const draw = (contractValue - deposit - final) / 2;
    const lines = [
      { label: "Deposit (at signing)", amount: deposit },
      { label: "Progress draw — rough-in", amount: draw },
      { label: "Progress draw — finish", amount: draw },
      { label: "Final (at completion)", amount: final },
    ];
    let cum = 0;
    for (const l of lines) {
      cum += l.amount;
      schedule.push({ label: l.label, amount: Math.round(l.amount), paid: collected >= cum - 1 });
    }
  }

  // approved change orders only
  const cos = (await db.execute({
    sql: `SELECT description, amount, approved_date FROM change_orders WHERE project_id = ? AND approved = 1 ORDER BY approved_date DESC`,
    args: [projectId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }))).rows
    .map((r) => ({ description: String(r.description ?? ""), amount: Number(r.amount || 0), approvedDate: r.approved_date ? String(r.approved_date) : null }));

  // next upcoming inspection
  const insp = (await db.execute({
    sql: `SELECT permit_type, inspection_date, inspection_result FROM permits
          WHERE project_id = ? AND inspection_date IS NOT NULL
          ORDER BY inspection_date ASC`,
    args: [projectId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }))).rows;
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = insp.find((r) => String(r.inspection_date) >= todayIso) ?? null;
  const nextInspection = upcoming
    ? { type: String(upcoming.permit_type ?? "Inspection"), date: String(upcoming.inspection_date), result: upcoming.inspection_result ? String(upcoming.inspection_result) : null }
    : null;

  // progress milestones — event summaries only (NO crew_present, hours_worked, detail, action_items)
  const milestones = (await db.execute({
    sql: `SELECT event_date, summary FROM job_events WHERE project_id = ? ORDER BY event_date DESC, created_at DESC LIMIT 8`,
    args: [projectId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }))).rows
    .filter((r) => r.summary)
    .map((r) => ({ date: String(r.event_date ?? ""), summary: String(r.summary) }));

  // photos with a hosted URL only
  const photos = (await db.execute({
    sql: `SELECT file_url, caption FROM job_photos WHERE project_id = ? AND file_url IS NOT NULL ORDER BY taken_at DESC NULLS LAST, created_at DESC LIMIT 24`,
    args: [projectId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }))).rows
    .map((r) => ({ url: String(r.file_url), caption: r.caption ? String(r.caption) : null }));

  const phase = proj.current_phase ? String(proj.current_phase) : null;
  return {
    name: String(proj.name ?? "Your project"),
    address: proj.address ? String(proj.address) : null,
    clientName: proj.client_name ? String(proj.client_name) : null,
    phase,
    phaseLabel: phase ? (PHASE_LABEL[phase] ?? phase) : "—",
    phaseIndex: phase ? PHASES.indexOf(phase as (typeof PHASES)[number]) : -1,
    phases: PHASES.map((k) => ({ key: k, label: PHASE_LABEL[k] })),
    startedAt: proj.actual_start ? String(proj.actual_start) : null,
    targetEnd: proj.actual_end ? String(proj.actual_end) : null,
    schedule,
    collected: Math.round(collected),
    contractValue,
    changeOrders: cos,
    nextInspection,
    milestones,
    photos,
  };
}
