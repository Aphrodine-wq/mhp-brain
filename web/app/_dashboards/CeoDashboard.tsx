import Link from "next/link";
import { db } from "@/lib/db";
import { money } from "@/lib/format";

// Rick's cockpit. One screen, answers four questions:
// 1. How's the money? (cash in, cash out, margins)
// 2. What's at risk? (overruns, stale bids, pending COs)
// 3. What needs my decision? (approvals, exceptions)
// 4. What happened today? (crew activity, logged events)

export default async function CeoDashboard() {
  // All four reads are independent, so fire them concurrently — one round-trip's worth of latency
  // for the whole cockpit instead of four in series.
  const [projects, recentPayments, inspections, todayEvents] = await Promise.all([
    // Active jobs with values
    db.execute(`
      SELECT p.id, p.name, p.status, p.current_phase, p.contract_value,
             (SELECT MAX(e.sum_sov_total) FROM estimates e WHERE e.project_id = p.id AND e.sum_sov_total > 0) AS bid_value,
             (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay WHERE pay.project_id = p.id) AS collected,
             (SELECT COUNT(*) FROM change_orders co WHERE co.project_id = p.id AND co.approved = 0) AS pending_cos,
             (SELECT COUNT(*) FROM callbacks cb WHERE cb.project_id = p.id AND cb.resolved_date IS NULL) AS open_callbacks,
             (SELECT COUNT(*) FROM job_events je WHERE je.project_id = p.id AND je.event_date = CURRENT_DATE::text) AS events_today
      FROM projects p
      WHERE p.status IN ('Active', 'active', 'Aging')
      ORDER BY COALESCE(p.contract_value, 0) DESC NULLS LAST
    `).then((r) => r.rows),
    // Recent payments (last 7 days)
    db.execute(`
      SELECT pay.amount, pay.payment_date, pay.method, pay.payment_type, p.name AS project_name
      FROM payments pay JOIN projects p ON pay.project_id = p.id
      WHERE pay.payment_date >= (CURRENT_DATE - INTERVAL '7 days')::text
      ORDER BY pay.payment_date DESC
      LIMIT 10
    `).then((r) => r.rows),
    // Upcoming inspections
    db.execute(`
      SELECT pm.permit_type, pm.inspection_date, p.name AS project_name
      FROM permits pm JOIN projects p ON pm.project_id = p.id
      WHERE pm.inspection_result = 'pending' AND pm.inspection_date IS NOT NULL
      ORDER BY pm.inspection_date
      LIMIT 5
    `).then((r) => r.rows),
    // Today's logged events (most recent)
    db.execute(`
      SELECT je.event_type, je.summary, je.logged_by, p.name AS project_name
      FROM job_events je JOIN projects p ON je.project_id = p.id
      WHERE je.event_date = CURRENT_DATE::text
      ORDER BY je.created_at DESC
      LIMIT 10
    `).then((r) => r.rows),
  ]);

  // Portfolio totals
  const totalBid = projects.reduce((s, p) => s + Number(p.bid_value ?? 0), 0);
  const totalCollected = projects.reduce((s, p) => s + Number(p.collected ?? 0), 0);
  const totalPendingCOs = projects.reduce((s, p) => s + Number(p.pending_cos ?? 0), 0);
  const totalOpenCallbacks = projects.reduce((s, p) => s + Number(p.open_callbacks ?? 0), 0);
  const jobsLoggedToday = projects.filter((p) => Number(p.events_today) > 0).length;
  const jobsNotLogged = projects.filter((p) => Number(p.events_today) === 0).length;

  // Jobs at risk: high bid but nothing collected, or pending COs
  const atRisk = projects.filter(
    (p) => (Number(p.bid_value ?? 0) > 50000 && Number(p.collected ?? 0) === 0) || Number(p.pending_cos ?? 0) > 0 || Number(p.open_callbacks ?? 0) > 0,
  );

  return (
    <section className="view">
      <h2>Morning Cockpit</h2>
      <div className="sub">What matters right now. {projects.length} active jobs.</div>

      {/* Money strip */}
      <div className="stat-strip">
        <div>
          <div className="sv">{money(totalBid)}</div>
          <div className="sk">Active book value</div>
        </div>
        <div>
          <div className="sv">{money(totalCollected)}</div>
          <div className="sk">Collected</div>
        </div>
        <div>
          <div className="sv">{money(totalBid - totalCollected)}</div>
          <div className="sk">Outstanding</div>
        </div>
        <div>
          <div className="sv">{projects.length}</div>
          <div className="sk">Active jobs</div>
        </div>
      </div>

      <div className="cols">
        {/* Left column: Needs attention */}
        <div>
          {/* Decisions needed */}
          {(totalPendingCOs > 0 || totalOpenCallbacks > 0 || atRisk.length > 0) && (
            <div className="panel">
              <h3>Needs your attention</h3>
              {totalPendingCOs > 0 && (
                <div className="prow">
                  <span style={{ fontSize: 18, marginRight: 4 }}>📝</span>
                  <span className="pn">{totalPendingCOs} pending change order{totalPendingCOs > 1 ? "s" : ""} to approve</span>
                </div>
              )}
              {totalOpenCallbacks > 0 && (
                <div className="prow">
                  <span style={{ fontSize: 18, marginRight: 4 }}>⚠️</span>
                  <span className="pn">{totalOpenCallbacks} unresolved warranty callback{totalOpenCallbacks > 1 ? "s" : ""}</span>
                </div>
              )}
              {atRisk.map((p) => (
                <div className="prow" key={String(p.id)}>
                  <div className="dot" style={{ background: "#e65100" }} />
                  <span className="pn">{String(p.name)}</span>
                  <span className="pv" style={{ color: "#e65100" }}>
                    {Number(p.pending_cos) > 0 ? `${p.pending_cos} CO` : ""}
                    {Number(p.collected) === 0 && Number(p.bid_value) > 0 ? " $0 collected" : ""}
                    {Number(p.open_callbacks) > 0 ? ` ${p.open_callbacks} callback` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Inspections coming up */}
          {inspections.length > 0 && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h3>Upcoming inspections</h3>
              {inspections.map((i, idx) => (
                <div className="prow" key={idx}>
                  <span style={{ fontSize: 18, marginRight: 4 }}>🔍</span>
                  <span className="pn">{String(i.project_name)}</span>
                  <span className="pv">{String(i.permit_type)} — {String(i.inspection_date)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Crew activity */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Today&apos;s activity</h3>
            <div className="prow">
              <span className="pn">{jobsLoggedToday} job{jobsLoggedToday !== 1 ? "s" : ""} logged today</span>
              {jobsNotLogged > 0 && (
                <span className="pv" style={{ color: "#e65100" }}>{jobsNotLogged} not logged</span>
              )}
            </div>
            {todayEvents.map((ev, idx) => (
              <div className="prow" key={idx}>
                <div className="dot" style={{ background: "#0b3d91" }} />
                <span className="pn">{String(ev.project_name)}</span>
                <span className="pv">{String(ev.summary).slice(0, 60)}{String(ev.summary).length > 60 ? "..." : ""}</span>
              </div>
            ))}
            {todayEvents.length === 0 && (
              <div className="prow"><span className="pn" style={{ color: "#5b6470" }}>No logs yet today.</span></div>
            )}
          </div>
        </div>

        {/* Right column: Money movement */}
        <div>
          <div className="panel">
            <h3>Money in (last 7 days)</h3>
            {recentPayments.length > 0 ? recentPayments.map((pay, idx) => (
              <div className="prow" key={idx}>
                <span className="pn">{String(pay.project_name)}</span>
                <span className="pv" style={{ color: "#2e7d32", fontWeight: 600 }}>{money(Number(pay.amount))}</span>
              </div>
            )) : (
              <div className="prow"><span className="pn" style={{ color: "#5b6470" }}>No payments this week.</span></div>
            )}
          </div>

          {/* Active jobs summary */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Active jobs</h3>
            {projects.slice(0, 8).map((p) => {
              const bid = Number(p.bid_value ?? 0);
              const coll = Number(p.collected ?? 0);
              const pct = bid > 0 ? Math.round((coll / bid) * 100) : 0;
              return (
                <div className="prow" key={String(p.id)}>
                  <span className="pn">{String(p.name)}</span>
                  <span className="pv">{money(bid)}</span>
                  <span className="pv" style={{ width: 50, textAlign: "right" }}>{pct}%</span>
                </div>
              );
            })}
            {projects.length > 8 && (
              <div className="prow">
                <Link href="/projects" style={{ color: "#0b3d91", fontWeight: 600, fontSize: 13 }}>
                  View all {projects.length} projects →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
