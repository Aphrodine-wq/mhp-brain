import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createJobEvent, createChangeOrder, createPayment, updateProjectOps } from "@/lib/operations";

// GET /api/field/daily — load today's briefing: active jobs + what the system already knows
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Active projects
  const projects = (await db.execute(`
    SELECT id, name, type, status, current_phase,
           client_name, client_phone, address, contract_value
    FROM projects
    WHERE status IN ('Active', 'active', 'Aging')
    ORDER BY name
  `)).rows;

  // Today's events already logged (so we don't re-ask)
  const todayEvents = (await db.execute({
    sql: `SELECT project_id, event_type, summary FROM job_events WHERE event_date = ?`,
    args: [today],
  })).rows;

  // Pending change orders (unapproved)
  const pendingCOs = (await db.execute(`
    SELECT project_id, description, amount FROM change_orders WHERE approved = 0
  `)).rows;

  // Upcoming inspections (next 7 days)
  const inspections = (await db.execute({
    sql: `SELECT pm.project_id, pm.permit_type, pm.inspection_date, p.name AS project_name
          FROM permits pm JOIN projects p ON pm.project_id = p.id
          WHERE pm.inspection_result = 'pending'
            AND pm.inspection_date IS NOT NULL
            AND pm.inspection_date <= (CURRENT_DATE + INTERVAL '7 days')::text
          ORDER BY pm.inspection_date`,
    args: [],
  })).rows;

  // Open callbacks (unresolved warranty issues)
  const openCallbacks = (await db.execute(`
    SELECT cb.project_id, cb.issue, cb.reported_date, p.name AS project_name
    FROM callbacks cb JOIN projects p ON cb.project_id = p.id
    WHERE cb.resolved_date IS NULL
  `)).rows;

  // Payment summary per active project
  const paymentSummaries = (await db.execute(`
    SELECT project_id, COALESCE(SUM(amount), 0) AS total_collected, COUNT(*) AS payment_count
    FROM payments
    GROUP BY project_id
  `)).rows;

  // Latest estimate value per project
  const estimates = (await db.execute(`
    SELECT project_id, MAX(sum_sov_total) AS bid_value
    FROM estimates
    WHERE sum_sov_total > 0
    GROUP BY project_id
  `)).rows;

  // Build the briefing per project
  const estMap = new Map(estimates.map((e) => [String(e.project_id), Number(e.bid_value)]));
  const payMap = new Map(paymentSummaries.map((p) => [String(p.project_id), { collected: Number(p.total_collected), count: Number(p.payment_count) }]));
  const eventsByProject = new Map<string, typeof todayEvents>();
  for (const ev of todayEvents) {
    const pid = String(ev.project_id);
    if (!eventsByProject.has(pid)) eventsByProject.set(pid, []);
    eventsByProject.get(pid)!.push(ev);
  }

  const briefing = projects.map((p) => {
    const pid = String(p.id);
    return {
      id: pid,
      name: String(p.name),
      type: p.type ? String(p.type) : null,
      status: String(p.status),
      phase: p.current_phase ? String(p.current_phase) : null,
      client_name: p.client_name ? String(p.client_name) : null,
      address: p.address ? String(p.address) : null,
      bid_value: estMap.get(pid) ?? null,
      collected: payMap.get(pid)?.collected ?? 0,
      logged_today: (eventsByProject.get(pid) ?? []).map((e) => ({
        type: String(e.event_type),
        summary: String(e.summary),
      })),
      pending_cos: pendingCOs.filter((co) => String(co.project_id) === pid).map((co) => ({
        description: String(co.description),
        amount: Number(co.amount),
      })),
    };
  });

  return NextResponse.json({
    date: today,
    user: user.name,
    jobs: briefing,
    alerts: {
      upcoming_inspections: inspections.map((i) => ({
        project: String(i.project_name),
        type: String(i.permit_type),
        date: String(i.inspection_date),
      })),
      open_callbacks: openCallbacks.map((c) => ({
        project: String(c.project_name),
        issue: String(c.issue),
        reported: String(c.reported_date),
      })),
    },
  });
}

// POST /api/field/daily — submit the entire daily log in one batch
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const body = await req.json();
  const { entries } = body as { entries: DailyEntry[] };

  if (!entries || !Array.isArray(entries)) {
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let logged = 0;

  for (const entry of entries) {
    if (!entry.project_id) continue;

    // Skip projects marked "nothing happened"
    if (entry.skipped) continue;

    // Log the daily event
    if (entry.summary?.trim()) {
      await createJobEvent({
        project_id: entry.project_id,
        event_type: "daily_log",
        event_date: today,
        summary: entry.summary.trim(),
        crew_present: entry.crew_present,
        hours_worked: entry.hours_worked,
        weather: entry.weather,
        action_items: entry.action_items,
        logged_by: user.name,
      });
      logged++;
    }

    // If there was a scope change, log the change order
    if (entry.scope_change?.trim() && entry.scope_change_amount != null) {
      await createChangeOrder({
        project_id: entry.project_id,
        description: entry.scope_change.trim(),
        amount: entry.scope_change_amount,
        created_by: user.name,
      });
    }

    // If a payment came in, record it
    if (entry.payment_amount && entry.payment_amount > 0) {
      await createPayment({
        project_id: entry.project_id,
        amount: entry.payment_amount,
        payment_date: today,
        method: entry.payment_method,
        payment_type: entry.payment_type || "progress",
        notes: entry.payment_notes,
        recorded_by: user.name,
      });
    }

    // If they updated the phase, save it
    if (entry.new_phase) {
      await updateProjectOps(entry.project_id, { current_phase: entry.new_phase }, user.name);
    }

    // Any issues to flag
    if (entry.issue?.trim()) {
      await createJobEvent({
        project_id: entry.project_id,
        event_type: "issue",
        event_date: today,
        summary: entry.issue.trim(),
        logged_by: user.name,
      });
    }
  }

  return NextResponse.json({ ok: true, logged });
}

interface DailyEntry {
  project_id: string;
  skipped?: boolean;
  summary?: string;
  crew_present?: string;
  hours_worked?: number;
  weather?: string;
  action_items?: string;
  scope_change?: string;
  scope_change_amount?: number;
  payment_amount?: number;
  payment_method?: string;
  payment_type?: string;
  payment_notes?: string;
  new_phase?: string;
  issue?: string;
}
