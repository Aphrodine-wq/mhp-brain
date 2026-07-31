import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotePencil, Receipt, CreditCard, Buildings, FolderOpen, FileText, Invoice,
} from "@phosphor-icons/react/dist/ssr";
import { projectDetail } from "@/lib/queries";
import { getProjectOps, getActual } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import { projectMargin } from "@/lib/margin";
import { hasActiveShareLink } from "@/lib/share";
import { money, BADGE } from "@/lib/format";
import HeaderEdit, { type ProjectOps } from "./HeaderEdit";
import ShareLink from "./ShareLink";
import Closeout, { type CloseoutState } from "./Closeout";
import PhaseTrack from "./PhaseTrack";
import { TrelloMark, QuickBooksMark } from "../../BrandMarks";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();

  const canWrite = !!(await requireRole("editor"));
  // Overview only — the records themselves live on each section's own page.
  const [ops, margin, shareActive, actual] = await Promise.all([
    getProjectOps(id).catch(() => null) as Promise<ProjectOps | null>,
    projectMargin(id).catch(() => null),
    canWrite ? hasActiveShareLink(id).catch(() => false) : Promise.resolve(false),
    getActual(id).catch(() => null) as Promise<CloseoutState | null>,
  ]);
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  const tiles = [
    { href: `/projects/${id}/change-orders`, icon: <Receipt size={18} />, name: "Change orders" },
    { href: `/projects/${id}/log`, icon: <NotePencil size={18} />, name: "Job log" },
    { href: `/projects/${id}/documents`, icon: <FolderOpen size={18} />, name: "Documents" },
    { href: `/projects/${id}/estimates`, icon: <FileText size={18} />, name: "Estimates" },
    { href: `/projects/${id}/permits`, icon: <Buildings size={18} />, name: "Permits" },
    { href: `/projects/${id}/payments`, icon: <CreditCard size={18} />, name: "Payments" },
    { href: `/projects/${id}/invoices`, icon: <Invoice size={18} />, name: "Invoices" },
  ];

  return (
    <section className="view text-120">
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

      <PhaseTrack projectId={id} phase={ops?.current_phase ?? null} canWrite={canWrite} />

      {/* Sections first, then the numbers. Navigation is what people come to this page to do;
          the money reads as a summary under it rather than a wall to scroll past.
          Trello and QuickBooks ride along at the end — they are the same "take me there" action
          as the rest of the row, just leaving the app. */}
      <div className="tile-grid">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <span className="tile-icon">{t.icon}</span>
            <span className="tile-name">{t.name}</span>
          </Link>
        ))}
        <OutboundTile url={ops?.trello_url ?? null} label="Trello" mark={<TrelloMark size={18} />} />
        <OutboundTile url={ops?.quickbooks_url ?? null} label="QuickBooks" mark={<QuickBooksMark size={18} />} />
      </div>

      {/* Four bare numbers in identical boxes made you do the arithmetic yourself. The money now
          reads left to right as one sentence — what the job is worth, what is left after cost,
          what has actually come in — with the two ratios drawn as bars instead of parenthetical
          percentages. Work complete sits apart on the right: it is the only figure here that is
          someone's judgement rather than a number the books produced. */}
      <div className="jstats">
        <div className="jstat">
          <div className="jstat-k">Current bid value</div>
          <div className="jstat-v">{proj.value ? money(proj.value) : "—"}</div>
          <div className="jstat-sub">
            {margin?.estimatedCost != null ? `${money(margin.estimatedCost)} est. cost` : "no clean estimate"}
          </div>
        </div>

        <div className="jstat">
          <div className="jstat-k">Est. margin</div>
          <div className="jstat-v">{margin?.marginDollars != null ? money(margin.marginDollars) : "—"}</div>
          <Meter value={margin?.marginPct ?? null} tone={marginTone(margin?.marginPct ?? null)} />
          <div className="jstat-sub">{pct(margin?.marginPct ?? null)} of the bid</div>
        </div>

        <div className="jstat">
          <div className="jstat-k">Collected</div>
          <div className="jstat-v">{margin ? money(margin.collected) : "—"}</div>
          <Meter value={margin?.collectedPct ?? null} tone="navy" />
          <div className="jstat-sub">
            {margin && margin.collected > 0 && proj.value
              ? `${money(Math.max(0, proj.value - margin.collected))} outstanding`
              : "nothing invoiced yet"}
          </div>
        </div>

        <div className="jstat jstat-done">
          <div className="jstat-k">Work complete</div>
          <div className="jstat-v">{ops?.completion_pct == null ? "—" : `${ops.completion_pct}%`}</div>
          <Meter value={ops?.completion_pct == null ? null : ops.completion_pct / 100} tone="green" />
          <div className="jstat-sub">
            {ops?.completion_pct == null ? "not set" : ops.current_phase ? ops.current_phase.replace("_", " ") : "phase not set"}
          </div>
        </div>
      </div>

      {/* Same conversation as the row above, one step later in the job's life: what it was bid
          at versus what it actually cost. This is the only place the estimator's training set
          can grow — see lib/operations.ts recordActual(). */}
      <Closeout projectId={id} bid={proj.value || null} actual={actual} canWrite={canWrite} />
    </section>
  );
}

// A ratio as a bar. null renders the empty track rather than a zero-width fill, so "we don't
// know" and "none of it" stay visually distinct.
function Meter({ value, tone }: { value: number | null; tone: "navy" | "green" | "amber" | "red" }) {
  const w = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`jmeter ${tone}${value == null ? " empty" : ""}`}>
      <div className="jmeter-fill" style={{ width: `${w}%` }} />
    </div>
  );
}

// Margin is the one figure here worth colouring: thin margin is the thing that sinks a job.
// Thresholds are deliberately blunt — under 10% reads red, under 18% amber (MHP's default
// markup in the estimate builder is 18%), at or above that green.
function marginTone(p: number | null): "navy" | "green" | "amber" | "red" {
  if (p == null) return "navy";
  if (p < 0.1) return "red";
  if (p < 0.18) return "amber";
  return "green";
}

// Trello / QuickBooks as tiles in the section row. Unset renders dimmed and non-clickable rather
// than vanishing, so a job with no board is visible as a gap — same rule as the dashboard cards.
function OutboundTile({ url, label, mark }: { url: string | null; label: string; mark: React.ReactNode }) {
  if (!url) {
    return (
      <span className="tile off" title={`No ${label} link yet — add one under Edit details`}>
        <span className="tile-icon">{mark}</span>
        <span className="tile-name">{label}</span>
      </span>
    );
  }
  return (
    <a className="tile" href={url} target="_blank" rel="noopener noreferrer" title={`Open in ${label}`}>
      <span className="tile-icon">{mark}</span>
      <span className="tile-name">{label}</span>
    </a>
  );
}

