import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotePencil, Receipt, CreditCard, Buildings, FolderOpen, FileText,
} from "@phosphor-icons/react/dist/ssr";
import { projectDetail } from "@/lib/queries";
import { getProjectOps } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import { projectMargin } from "@/lib/margin";
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
  // Overview only — the records themselves live on each section's own page.
  const [ops, margin, shareActive] = await Promise.all([
    getProjectOps(id).catch(() => null) as Promise<ProjectOps | null>,
    projectMargin(id).catch(() => null),
    canWrite ? hasActiveShareLink(id).catch(() => false) : Promise.resolve(false),
  ]);
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  const tiles = [
    { href: `/projects/${id}/change-orders`, icon: <Receipt size={18} />, name: "Change orders" },
    { href: `/projects/${id}/log`, icon: <NotePencil size={18} />, name: "Job log" },
    { href: `/projects/${id}/documents`, icon: <FolderOpen size={18} />, name: "Documents" },
    { href: `/projects/${id}/estimates`, icon: <FileText size={18} />, name: "Estimates" },
    { href: `/projects/${id}/permits`, icon: <Buildings size={18} />, name: "Permits" },
    { href: `/projects/${id}/payments`, icon: <CreditCard size={18} />, name: "Payments" },
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

      <div className="stat-row">
        <div className="metric"><div className="v sm">{proj.value ? money(proj.value) : "—"}</div><div className="k">Current bid value</div></div>
        <div className="metric"><div className="v sm">{margin?.marginDollars != null ? money(margin.marginDollars) : "—"}</div><div className="k">Est. margin · {pct(margin?.marginPct ?? null)}</div></div>
        <div className="metric"><div className="v sm">{margin ? money(margin.collected) : "—"}</div><div className="k">Collected · {pct(margin?.collectedPct ?? null)}</div></div>
      </div>

      <Milestones phase={ops?.current_phase ?? null} />

      <div className="tile-grid">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <span className="tile-icon">{t.icon}</span>
            <span className="tile-name">{t.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// Project progress as milestones — driven by the phase set under "Edit details".
// Nothing set yet: shows the track with no step reached, so the crew knows to set it.
const MILESTONES = ["lead", "quoted", "scheduled", "in_progress", "complete"] as const;

function Milestones({ phase }: { phase: string | null }) {
  const reached = phase ? MILESTONES.indexOf(phase as (typeof MILESTONES)[number]) : -1;
  return (
    <div className="mstones">
      {MILESTONES.map((m, i) => (
        <div key={m} className={`mstone${i <= reached ? " done" : ""}${i === reached ? " now" : ""}`}>
          <div className="mstone-dot" />
          <div className="mstone-label">{m.replace("_", " ")}</div>
        </div>
      ))}
    </div>
  );
}
