import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { currentUser } from "@/lib/auth";
import { dashboardForRole } from "@/lib/role-nav";
import { projectsList } from "@/lib/queries";
import CeoDashboard from "./_dashboards/CeoDashboard";
import SalesDashboard from "./_dashboards/SalesDashboard";
import WeatherBanner from "./_dashboards/WeatherBanner";
import NewProjectButton from "./NewProjectButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const dashboard = dashboardForRole(user.role);

  // Role-specific dashboards
  if (dashboard === "ceo") return <CeoDashboard />;
  if (dashboard === "sales") return <SalesDashboard />;

  // Default dashboard (admin, editor, viewer, estimator, materials)
  const active = (await projectsList()).filter((p) => p.status === "Active");

  const jobs = (
    <div className="proj-cards">
      {active.length ? (
        active.map((x) => (
          // Not a <Link> wrapping the whole card any more — the Trello/QuickBooks anchors would
          // be nested inside it, which is invalid HTML and swallows the outbound click.
          <div key={x.id} className="pcard">
            <Link href={`/projects/${x.id}`} className="pc-open">
              <div className="pc-top">
                <div className="pc-name">{x.name}</div>
              </div>
              <CompletionBar pct={x.completion} />
            </Link>
            <ProjectLinks trello={x.trelloUrl} quickbooks={x.quickbooksUrl} />
          </div>
        ))
      ) : (
        <div className="sub">No active jobs right now.</div>
      )}
    </div>
  );

  return (
    <section className="view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Greeting name={user.name} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="stat-chip">
            <b>{active.length}</b>
            <span>Active projects</span>
          </div>
          <NewProjectButton />
          <Link className="btn cta" href="/estimate-builder">
            <Plus size={16} weight="bold" />
            New Estimate
          </Link>
        </div>
      </div>

      <WeatherBanner />

      <div className="sec-h">Active now</div>
      {jobs}
    </section>
  );
}

// Where else the job lives. Nothing renders until a link is set, so cards stay clean for the
// jobs that don't have a board or a customer record yet.
function ProjectLinks({ trello, quickbooks }: { trello: string | null; quickbooks: string | null }) {
  if (!trello && !quickbooks) return null;
  return (
    <div className="pc-links">
      {trello && (
        <a className="pc-link trello" href={trello} target="_blank" rel="noopener noreferrer">Trello</a>
      )}
      {quickbooks && (
        <a className="pc-link qb" href={quickbooks} target="_blank" rel="noopener noreferrer">QuickBooks</a>
      )}
    </div>
  );
}

// How far along the work is, set under "Edit details" on the project. Null means nobody has put
// a number on it yet — show the empty track rather than a misleading 0%.
function CompletionBar({ pct }: { pct: number | null }) {
  return (
    <div className="pc-prog">
      <div className="pc-prog-track">
        <div className="pc-prog-fill" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className="pc-prog-pct">{pct == null ? "—" : `${pct}%`}</span>
    </div>
  );
}

// "Good morning, Rick — Wednesday, July 29, 2026" — time-aware greeting in the
// company's own timezone (the server may be UTC).
function Greeting({ name }: { name: string }) {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(now),
  );
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(now);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--navy)" }}>{date}</div>
      <h2 style={{ margin: "6px 0 0", fontSize: 34 }}>Good {part}, {name.split(" ")[0]}</h2>
    </div>
  );
}
