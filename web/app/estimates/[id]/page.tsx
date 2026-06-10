import Link from "next/link";
import { notFound } from "next/navigation";
import { estimateDetail } from "@/lib/queries";
import { money } from "@/lib/format";
import PrintButton from "./PrintButton";

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
      <div className="row no-print" style={{ marginTop: 0, marginBottom: 20 }}>
        <Link className="btn ghost" href="/estimates">← All estimates</Link>
        <Link className="btn ghost" href={`/projects/${est.projectId}`}>View project</Link>
        {est.hasDoc && (
          <a className="btn ghost" href={`/api/estimates/${est.id}/document`}>Download original ↓</a>
        )}
        <PrintButton />
        <span className={`badge ${CONF[est.confidence] || "unknown"}`} style={{ marginLeft: "auto" }} title="Parse confidence">
          {est.confidence || "—"}
        </span>
      </div>

      {/* cover page — same paper as the client packet's cover; prints as page one */}
      <article className="doc-page cover" style={{ minHeight: 760 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="MHP" className="cover-logo" />
        <div className="cover-kicker">Construction Estimate</div>
        <h1 className="cover-title">{est.project}</h1>
        <div className="cover-meta">
          <div><span>Date</span><b>{est.date || "—"}</b></div>
          <div><span>Prepared by</span><b>MHP Construction</b></div>
          <div><span>Line items</span><b>{est.lineItems}</b></div>
          <div><span>Original file</span><b style={{ wordBreak: "break-word" }}>{est.source || "—"}</b></div>
        </div>
        <div className="cover-total">
          <span>Estimate total</span>
          <b>{est.total ? money(est.total) : "—"}</b>
          {est.sumItemTotal ? <small>{money(est.sumItemTotal)} item cost subtotal</small> : null}
        </div>
        <div className="cover-foot">MHP Construction · Oxford, MS · MS Residential Builder R21909</div>
      </article>

      <div className="card" style={{ maxWidth: 820, margin: "0 auto" }}>
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
