import Link from "next/link";
import { db } from "@/lib/db";
import { money } from "@/lib/format";

// Josh & Jason's screen. What's on today, what needs doing, quick links to log.

export default async function FieldDashboard({ userName }: { userName: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstName = userName.split(" ")[0];

  const projects = (await db.execute(`
    SELECT p.id, p.name, p.current_phase, p.address,
           (SELECT MAX(e.sum_sov_total) FROM estimates e WHERE e.project_id = p.id AND e.sum_sov_total > 0) AS bid_value,
           (SELECT je.summary FROM job_events je WHERE je.project_id = p.id ORDER BY je.event_date DESC, je.created_at DESC LIMIT 1) AS last_log,
           (SELECT je.event_date FROM job_events je WHERE je.project_id = p.id ORDER BY je.event_date DESC, je.created_at DESC LIMIT 1) AS last_log_date,
           (SELECT je.action_items FROM job_events je WHERE je.project_id = p.id AND je.action_items IS NOT NULL ORDER BY je.event_date DESC LIMIT 1) AS next_action,
           (SELECT COUNT(*) FROM permits pm WHERE pm.project_id = p.id AND pm.inspection_result = 'pending') AS pending_inspections,
           (SELECT COUNT(*) FROM sub_assignments sa WHERE sa.project_id = p.id AND sa.scheduled_date = '${today}') AS subs_today
    FROM projects p
    WHERE p.status IN ('Active', 'active', 'Aging')
    ORDER BY p.name
  `)).rows;

  const loggedToday = (await db.execute({
    sql: `SELECT project_id FROM job_events WHERE event_date = ? GROUP BY project_id`,
    args: [today],
  })).rows.map((r) => String(r.project_id));

  return (
    <section className="view">
      <h2>Hey {firstName}</h2>
      <div className="sub">{projects.length} active jobs. <Link href="/field/daily" style={{ color: "#0b3d91", fontWeight: 600 }}>Start end-of-day log →</Link></div>

      <div className="proj-cards">
        {projects.map((p) => {
          const pid = String(p.id);
          const logged = loggedToday.includes(pid);
          const hasAction = p.next_action && String(p.next_action).trim();
          const hasSubs = Number(p.subs_today) > 0;
          const hasInspection = Number(p.pending_inspections) > 0;

          return (
            <div key={pid} className="pcard" style={{ borderLeft: logged ? "3px solid #2e7d32" : hasAction ? "3px solid #e65100" : "3px solid #d8dde3" }}>
              <div className="pc-top">
                <div className="pc-name">{String(p.name)}</div>
                {p.current_phase && <span className="badge active" style={{ fontSize: 11 }}>{String(p.current_phase).replace("_", " ")}</span>}
              </div>

              {p.address && <div style={{ fontSize: 12, color: "#5b6470", marginBottom: 8 }}>{String(p.address)}</div>}

              {hasAction && (
                <div style={{ fontSize: 13, color: "#e65100", fontWeight: 600, marginBottom: 6 }}>
                  Next: {String(p.next_action)}
                </div>
              )}

              {hasSubs && <div style={{ fontSize: 12, color: "#0b3d91", marginBottom: 4 }}>Sub on site today</div>}
              {hasInspection && <div style={{ fontSize: 12, color: "#f57f17", marginBottom: 4 }}>Pending inspection</div>}

              {p.last_log && (
                <div style={{ fontSize: 12, color: "#5b6470", marginTop: 8 }}>
                  Last log ({String(p.last_log_date)}): {String(p.last_log).slice(0, 80)}{String(p.last_log).length > 80 ? "..." : ""}
                </div>
              )}

              <div className="pc-meta">
                <span>{money(Number(p.bid_value ?? 0))}</span>
                <span className="pdot" />
                {logged ? <span style={{ color: "#2e7d32" }}>Logged today</span> : <span style={{ color: "#e65100" }}>Not logged</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <Link className="btn" href="/field">Quick log</Link>
        <Link className="btn ghost" href="/field/daily">Daily log call</Link>
      </div>
    </section>
  );
}
