import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import {
  getProjectOps,
  getChangeOrders,
  getJobEvents,
  getPermits,
  getPayments,
} from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import { eventsForProject } from "@/lib/calendar";
import { listDocuments } from "@/lib/documents-store";
import { projectMargin } from "@/lib/margin";
import { laborVariance } from "@/lib/labor-variance";
import { hasActiveShareLink } from "@/lib/share";
import { money, BADGE } from "@/lib/format";
import EntityDocs from "../../_components/EntityDocs";
import HeaderEdit, { type ProjectOps } from "./HeaderEdit";
import ChangeOrderPanel, { type ChangeOrder } from "./ChangeOrderPanel";
import EventLogForm, { type JobEvent } from "./EventLogForm";
import PaymentForm, { type Payment } from "./PaymentForm";
import PermitPanel, { type Permit } from "./PermitPanel";
import ShareLink from "./ShareLink";

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
  const events = await eventsForProject(id).catch(() => []);

  // operational layer: app-owned tables written through lib/operations (audited)
  const canWrite = !!(await requireRole("editor"));
  const [ops, changeOrders, jobEvents, permits, payments, margin, labor, shareActive, docs] = await Promise.all([
    getProjectOps(id).catch(() => null) as Promise<ProjectOps | null>,
    getChangeOrders(id).catch(() => []) as Promise<unknown> as Promise<ChangeOrder[]>,
    getJobEvents(id).catch(() => []) as Promise<unknown> as Promise<JobEvent[]>,
    getPermits(id).catch(() => []) as Promise<unknown> as Promise<Permit[]>,
    getPayments(id).catch(() => []) as Promise<unknown> as Promise<Payment[]>,
    projectMargin(id).catch(() => null),
    laborVariance(id).catch(() => null),
    canWrite ? hasActiveShareLink(id).catch(() => false) : Promise.resolve(false),
    listDocuments({ entityType: "project", entityId: id }).catch(() => []),
  ]);
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <section className="view">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{proj.name}</h2>
        {canWrite ? (
          <HeaderEdit projectId={id} projectName={proj.name} status={proj.status} ops={ops} />
        ) : (
          <span className={`badge ${BADGE[proj.status] || "unknown"}`}>{proj.status}</span>
        )}
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {proj.market || "—"} · {proj.type || "—"} · last activity {proj.last || "—"}
      </div>

      <div className="row" style={{ marginTop: 0, justifyContent: "space-between" }}>
        <Link className="btn ghost" href="/projects">← All projects</Link>
        {canWrite && <ShareLink projectId={id} hasActive={shareActive} />}
      </div>

      <div className="stat-strip">
        <div><div className="sv">{proj.value ? money(proj.value) : "—"}</div><div className="sk">Current bid value</div></div>
        <div><div className="sv">{proj.estimates.length}</div><div className="sk">Estimates on file</div></div>
        <div><div className="sv">{proj.last || "—"}</div><div className="sk">Last activity</div></div>
      </div>

      {margin && (margin.bid != null || margin.collected > 0) && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Margin (estimated)</h3>
          <div className="stat-strip" style={{ margin: 0, border: 0, padding: "8px 2px" }}>
            <div><div className="sv">{margin.bid != null ? money(margin.bid) : "—"}</div><div className="sk">Bid</div></div>
            <div><div className="sv">{margin.estimatedCost != null ? money(margin.estimatedCost) : "—"}</div><div className="sk">Est. cost</div></div>
            <div><div className="sv">{margin.marginDollars != null ? money(margin.marginDollars) : "—"}</div><div className="sk">Est. margin · {pct(margin.marginPct)}</div></div>
            <div><div className="sv">{money(margin.collected)}</div><div className="sk">Collected · {pct(margin.collectedPct)}</div></div>
          </div>
          <div className="setrow"><div className="sd">Estimated from the bid — actual cost lands when QuickBooks is connected.</div></div>
        </div>
      )}

      {labor && labor.estimatedLabor != null && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Labor (estimate vs actual)</h3>
          <div className="stat-strip" style={{ margin: 0, border: 0, padding: "8px 2px" }}>
            <div><div className="sv">{money(labor.estimatedLabor)}</div><div className="sk">Est. labor</div></div>
            <div><div className="sv">{labor.actualLabor != null ? money(labor.actualLabor) : "—"}</div><div className="sk">Actual labor</div></div>
            <div><div className="sv">{labor.varianceDollars != null ? money(labor.varianceDollars) : "—"}</div><div className="sk">Variance{labor.variancePct != null ? ` · ${pct(labor.variancePct)}` : ""}</div></div>
          </div>
          <div className="setrow"><div className="sd">
            {labor.status === "awaiting_quickbooks"
              ? `Estimated labor from ${labor.cleanLines} labor line${labor.cleanLines === 1 ? "" : "s"}${labor.combinedLines ? ` + ${labor.combinedLines} combined (labor portion)` : ""} — actual lands when QuickBooks is connected.`
              : "Actual labor cost from QuickBooks. Positive variance = over the bid."}
          </div></div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Job log</h3>
        <EventLogForm projectId={id} events={jobEvents} canWrite={canWrite} />
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Change orders</h3>
        <ChangeOrderPanel projectId={id} changeOrders={changeOrders} canWrite={canWrite} />
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Payments</h3>
        <PaymentForm projectId={id} payments={payments} contractValue={ops?.contract_value ?? null} canWrite={canWrite} />
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Permits & inspections</h3>
        <PermitPanel projectId={id} permits={permits} canWrite={canWrite} />
      </div>

      {events.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Coming up</h3>
          {events.map((ev, i) => (
            <div className="setrow" key={i}>
              <div>
                <div className="sl">
                  {ev.webLink ? <a href={ev.webLink} target="_blank" rel="noreferrer" className="cell-link">{ev.subject}</a> : ev.subject}
                </div>
                {ev.location && <div className="sd">{ev.location}</div>}
              </div>
              <span className="sd" style={{ whiteSpace: "nowrap" }}>
                {ev.startAt.slice(0, 10)}{ev.isAllDay ? "" : ` · ${ev.startAt.slice(11, 16)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <EntityDocs
        entityType="project"
        entityId={id}
        entityLabel={proj.name}
        docs={docs}
        slots={[
          { category: "Contract", required: true },
          { category: "Permit", required: false },
          { category: "Plan", required: false },
          { category: "Insurance (COI)", required: false },
          { category: "Other", required: false, hint: "Anything else worth keeping on this job." },
        ]}
      />

      <div className="sec-h">Estimate originals</div>
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
