import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotePencil, Receipt, CreditCard, Buildings, FolderOpen, FileText,
} from "@phosphor-icons/react/dist/ssr";
import { projectDetail } from "@/lib/queries";
import {
  getProjectOps,
  getChangeOrders,
  getJobEvents,
  getPermits,
  getPayments,
} from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import { listDocuments } from "@/lib/documents-store";
import { projectMargin } from "@/lib/margin";
import { laborVariance } from "@/lib/labor-variance";
import { hasActiveShareLink } from "@/lib/share";
import { money, BADGE } from "@/lib/format";
import HeaderEdit, { type ProjectOps } from "./HeaderEdit";
import ShareLink from "./ShareLink";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();

  const canWrite = !!(await requireRole("editor"));
  // Counts for the tiles — the actual records live on each section's own page now.
  const [ops, changeOrders, jobEvents, permits, payments, margin, labor, shareActive, docs] = await Promise.all([
    getProjectOps(id).catch(() => null) as Promise<ProjectOps | null>,
    getChangeOrders(id).catch(() => []),
    getJobEvents(id).catch(() => []),
    getPermits(id).catch(() => []),
    getPayments(id).catch(() => []),
    projectMargin(id).catch(() => null),
    laborVariance(id).catch(() => null),
    canWrite ? hasActiveShareLink(id).catch(() => false) : Promise.resolve(false),
    listDocuments({ entityType: "project", entityId: id }).catch(() => []),
  ]);
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
  const showLabor = !!(labor && labor.estimatedLabor != null);

  const tiles = [
    { href: `/projects/${id}/log`, icon: <NotePencil size={18} />, name: "Job log", sub: `${jobEvents.length} entr${jobEvents.length === 1 ? "y" : "ies"}` },
    { href: `/projects/${id}/change-orders`, icon: <Receipt size={18} />, name: "Change orders", sub: `${changeOrders.length} on file` },
    { href: `/projects/${id}/payments`, icon: <CreditCard size={18} />, name: "Payments", sub: `${payments.length} recorded` },
    { href: `/projects/${id}/permits`, icon: <Buildings size={18} />, name: "Permits", sub: `${permits.length} tracked` },
    { href: `/projects/${id}/documents`, icon: <FolderOpen size={18} />, name: "Documents", sub: `${docs.length} on file` },
    { href: `/projects/${id}/estimates`, icon: <FileText size={18} />, name: "Estimates", sub: `${proj.estimates.length} on file` },
  ];

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0, justifyContent: "space-between" }}>
        <Link className="btn ghost" href="/projects">← All projects</Link>
        {canWrite && <ShareLink projectId={id} hasActive={shareActive} />}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 22 }}>
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

      <div className="stat-grid">
        <div className="metric"><div className="v sm">{proj.value ? money(proj.value) : "—"}</div><div className="k">Current bid value</div></div>
        <div className="metric"><div className="v sm">{margin?.estimatedCost != null ? money(margin.estimatedCost) : "—"}</div><div className="k">Est. cost</div></div>
        <div className="metric"><div className="v sm">{margin?.marginDollars != null ? money(margin.marginDollars) : "—"}</div><div className="k">Est. margin · {pct(margin?.marginPct ?? null)}</div></div>
        <div className="metric"><div className="v sm">{margin ? money(margin.collected) : "—"}</div><div className="k">Collected · {pct(margin?.collectedPct ?? null)}</div></div>
        <div className="metric"><div className="v sm">{proj.estimates.length}</div><div className="k">Estimates on file</div></div>
      </div>
      {margin && (margin.bid != null || margin.collected > 0) && (
        <div className="sub" style={{ marginTop: 8, fontSize: 12 }}>Estimated from the bid — actual cost lands when QuickBooks is connected.</div>
      )}

      {showLabor && labor && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h3>Labor (estimate vs actual)</h3>
          <div className="stat-grid" style={{ margin: 0, padding: "4px 16px 16px" }}>
            <div className="metric flat"><div className="v sm">{money(labor.estimatedLabor)}</div><div className="k">Est. labor</div></div>
            <div className="metric flat"><div className="v sm">{labor.actualLabor != null ? money(labor.actualLabor) : "—"}</div><div className="k">Actual labor</div></div>
            <div className="metric flat"><div className="v sm">{labor.varianceDollars != null ? money(labor.varianceDollars) : "—"}</div><div className="k">Variance{labor.variancePct != null ? ` · ${pct(labor.variancePct)}` : ""}</div></div>
          </div>
          <div className="setrow"><div className="sd">
            {labor.status === "awaiting_quickbooks"
              ? `Estimated labor from ${labor.cleanLines} labor line${labor.cleanLines === 1 ? "" : "s"}${labor.combinedLines ? ` + ${labor.combinedLines} combined (labor portion)` : ""} — actual lands when QuickBooks is connected.`
              : "Actual labor cost from QuickBooks. Positive variance = over the bid."}
          </div></div>
        </div>
      )}

      <div className="tile-grid">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <span className="tile-icon">{t.icon}</span>
            <span className="tile-name">{t.name}</span>
            <span className="tile-sub">{t.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
