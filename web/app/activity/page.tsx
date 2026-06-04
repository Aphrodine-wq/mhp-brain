import { auditList } from "@/lib/overrides";

export const dynamic = "force-dynamic";

function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return ts;
  }
}

export default async function ActivityPage() {
  const rows = await auditList(300);
  return (
    <section className="view">
      <h2>Activity</h2>
      <div className="sub">Every correction — who made it, when, and what changed. The audit trail behind the data.</div>

      {rows.length ? (
        <div className="card">
          <table className="dtable">
            <thead>
              <tr><th>When</th><th>Who</th><th>What</th><th>Change</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(r.ts)}</td>
                  <td>{r.actor}</td>
                  <td>{r.label || r.entity_id} <small className="j">· {r.field}</small></td>
                  <td>{r.old ?? "—"} → <b>{r.new ?? "—"}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <div className="big">No corrections yet</div>
          Status changes, sub confirmations, and dismissed flags will show up here.
        </div>
      )}
    </section>
  );
}
