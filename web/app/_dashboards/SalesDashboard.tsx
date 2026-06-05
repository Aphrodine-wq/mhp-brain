import Link from "next/link";
import { db } from "@/lib/db";
import { money } from "@/lib/format";

// Todd's screen. Leads, follow-ups, conversion tracking.

export default async function SalesDashboard() {
  // Pipeline by phase
  const pipeline = (await db.execute(`
    SELECT current_phase, COUNT(*) AS cnt,
           COALESCE(SUM(contract_value), 0) + COALESCE(SUM(
             (SELECT MAX(e.sum_sov_total) FROM estimates e WHERE e.project_id = p.id AND e.sum_sov_total > 0)
           ), 0) AS value
    FROM projects p
    WHERE status IN ('Active', 'active', 'Aging')
    GROUP BY current_phase
    ORDER BY CASE current_phase
      WHEN 'lead' THEN 1 WHEN 'quoted' THEN 2 WHEN 'scheduled' THEN 3
      WHEN 'in_progress' THEN 4 WHEN 'complete' THEN 5 WHEN 'paid' THEN 6
      ELSE 7 END
  `)).rows;

  // Recent leads (newest projects)
  const recentLeads = (await db.execute(`
    SELECT id, name, type, lead_source, current_phase, client_name, client_phone,
           (SELECT MAX(e.sum_sov_total) FROM estimates e WHERE e.project_id = p.id AND e.sum_sov_total > 0) AS bid_value
    FROM projects p
    WHERE status IN ('Active', 'active', 'Aging')
    ORDER BY COALESCE(actual_start, '9999') DESC
    LIMIT 15
  `)).rows;

  // Win/loss stats
  const stats = (await db.execute(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('Active', 'active')) AS active,
      COUNT(*) FILTER (WHERE status = 'Dead') AS dead,
      COUNT(*) FILTER (WHERE lead_source IS NOT NULL) AS with_source,
      COUNT(*) FILTER (WHERE lost_reason IS NOT NULL) AS with_reason
    FROM projects
  `)).rows[0];

  return (
    <section className="view">
      <h2>Sales Pipeline</h2>
      <div className="sub">Every lead, where it stands, what needs follow-up.</div>

      {/* Pipeline funnel */}
      <div className="stat-strip">
        {pipeline.map((stage) => (
          <div key={String(stage.current_phase ?? "unknown")}>
            <div className="sv">{Number(stage.cnt)}</div>
            <div className="sk">{String(stage.current_phase ?? "no phase").replace("_", " ")}</div>
          </div>
        ))}
      </div>

      {/* Leads table */}
      <div className="panel" style={{ marginTop: 20 }}>
        <h3>Active leads & jobs</h3>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Phone</th>
              <th>Source</th>
              <th>Phase</th>
              <th className="n">Value</th>
            </tr>
          </thead>
          <tbody>
            {recentLeads.map((l) => (
              <tr key={String(l.id)}>
                <td style={{ fontWeight: 600 }}>{String(l.name)}</td>
                <td>{l.client_name ? String(l.client_name) : "—"}</td>
                <td>{l.client_phone ? String(l.client_phone) : "—"}</td>
                <td>{l.lead_source ? String(l.lead_source) : "—"}</td>
                <td>{l.current_phase ? String(l.current_phase).replace("_", " ") : "—"}</td>
                <td className="n">{l.bid_value ? money(Number(l.bid_value)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tracking gaps */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Data health</h3>
        <div className="prow">
          <span className="pn">Projects with lead source tracked</span>
          <span className="pv">{Number(stats?.with_source ?? 0)} of {Number(stats?.active ?? 0) + Number(stats?.dead ?? 0)}</span>
        </div>
        <div className="prow">
          <span className="pn">Dead leads with loss reason</span>
          <span className="pv">{Number(stats?.with_reason ?? 0)} of {Number(stats?.dead ?? 0)}</span>
        </div>
      </div>
    </section>
  );
}
