import Link from "next/link";
import { notFound } from "next/navigation";
import { estimateDetail } from "@/lib/queries";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONF: Record<string, string> = {
  HIGH: "active",
  MEDIUM: "aging",
  PARTIAL: "bid",
  LOW: "dead",
};

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const est = await estimateDetail(id);
  if (!est) notFound();

  // group consecutive lines by division for header band rows, same shape as the builder table
  const groups: { division: string; lines: typeof est.lines }[] = [];
  for (const l of est.lines) {
    const div = l.division || "Other";
    const last = groups[groups.length - 1];
    if (!last || last.division !== div) groups.push({ division: div, lines: [l] });
    else last.lines.push(l);
  }

  return (
    <section className="view">
      <h2>{est.project}</h2>
      <div className="sub" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>{est.date || "No date"}</span>·<span>{est.source || "—"}</span>·
        <span className={`badge ${CONF[est.confidence] || "unknown"}`}>{est.confidence || "—"}</span>
      </div>

      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href="/estimates">← All estimates</Link>
        <Link className="btn ghost" href={`/projects/${est.projectId}`}>View project</Link>
        {est.hasDoc && (
          <a className="btn" href={`/api/estimates/${est.id}/document`}>Download original ↓</a>
        )}
      </div>

      <div className="stat-strip">
        <div><div className="sv">{est.total ? money(est.total) : "—"}</div><div className="sk">Estimate total</div></div>
        <div><div className="sv">{est.lineItems}</div><div className="sk">Line items</div></div>
        <div><div className="sv">{est.sumItemTotal ? money(est.sumItemTotal) : "—"}</div><div className="sk">Item cost subtotal</div></div>
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <table className="dtable">
          <thead>
            <tr>
              <th>CSI</th><th>Item</th><th className="n">Qty</th><th>Unit</th>
              <th className="n">Rate</th><th className="n">Line total</th>
            </tr>
          </thead>
          <tbody>
            {est.lines.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="big">No line items parsed</div>
                    The original document may still be downloadable above.
                  </div>
                </td>
              </tr>
            ) : (
              groups.map((g, gi) => (
                <DivisionGroup key={gi} division={g.division}>
                  {g.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.itemNo || ""}</td>
                      <td>
                        {l.description}
                        {l.subName && <div className="line-detail">Sub: {l.subName}</div>}
                      </td>
                      <td className="n">{l.qty ?? "—"}</td>
                      <td>{l.unit || ""}</td>
                      <td className="n">{l.unitPrice != null ? money(l.unitPrice) : "—"}</td>
                      <td className="n">{l.itemTotal != null ? money(l.itemTotal) : "—"}</td>
                    </tr>
                  ))}
                </DivisionGroup>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// division band row + its lines, matching the builder table's grouping
function DivisionGroup({ division, children }: { division: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="div">
        <td colSpan={6}>{division}</td>
      </tr>
      {children}
    </>
  );
}
