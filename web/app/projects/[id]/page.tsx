import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONF: Record<string, string> = {
  HIGH: "active",
  MEDIUM: "aging",
  PARTIAL: "bid",
  LOW: "dead",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();

  return (
    <section className="view">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{proj.name}</h2>
        <span className={`badge ${BADGE[proj.status] || "unknown"}`}>{proj.status}</span>
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {proj.market || "—"} · {proj.type || "—"} · last activity {proj.last || "—"}
      </div>

      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href="/projects">← All projects</Link>
      </div>

      <div className="stat-strip">
        <div><div className="sv">{proj.value ? money(proj.value) : "—"}</div><div className="sk">Current bid value</div></div>
        <div><div className="sv">{proj.estimates.length}</div><div className="sk">Estimates on file</div></div>
        <div><div className="sv">{proj.last || "—"}</div><div className="sk">Last activity</div></div>
      </div>

      <div className="sec-h">Estimates on file</div>
      <div className="card" style={{ marginTop: 16 }}>
        <table className="dtable">
          <thead>
            <tr>
              <th>Date</th><th>Source</th><th className="n">Line items</th>
              <th className="n">Total</th><th>Parse</th>
            </tr>
          </thead>
          <tbody>
            {proj.estimates.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <div className="big">No estimates on file</div>
                    Nothing parsed for this job yet.
                  </div>
                </td>
              </tr>
            ) : (
              proj.estimates.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/estimates/${e.id}`} className="cell-link">{e.date || "View estimate"}</Link>
                  </td>
                  <td>
                    {e.hasDoc ? (
                      <a
                        href={`/api/estimates/${e.id}/document`}
                        title={`Download original: ${e.source}`}
                        style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                      >
                        {e.source || "Document"} ↓
                      </a>
                    ) : (
                      <small
                        className="j"
                        title={e.source}
                        style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                      >
                        {e.source || "—"}
                      </small>
                    )}
                  </td>
                  <td className="n">{e.lineItems}</td>
                  <td className="n">{e.total ? money(e.total) : "—"}</td>
                  <td>
                    <span className={`badge ${CONF[e.confidence] || "unknown"}`}>{e.confidence || "—"}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
