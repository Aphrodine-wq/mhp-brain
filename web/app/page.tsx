import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { dashboardForRole } from "@/lib/role-nav";
import { stats, projectsList } from "@/lib/queries";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import CeoDashboard from "./_dashboards/CeoDashboard";
import SalesDashboard from "./_dashboards/SalesDashboard";
import WeatherBanner from "./_dashboards/WeatherBanner";
import GbpReviews from "./_dashboards/GbpReviews";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const dashboard = dashboardForRole(user.role);

  // Role-specific dashboards
  if (dashboard === "ceo") return <CeoDashboard />;
  if (dashboard === "sales") return <SalesDashboard />;

  // Default dashboard (admin, editor, viewer, estimator, materials)
  const [s, projects] = await Promise.all([stats(), projectsList()]);
  const active = projects.filter((p) => p.status === "Active");

  // live context per card when the integrations have synced — Trello stage + next event.
  // Both reads tolerate the tables not existing yet (no syncs run).
  const stageById = new Map<string, string>();
  const nextEventById = new Map<string, string>();
  try {
    const cards = (await db.execute("SELECT project_id, list FROM trello_cards WHERE closed = FALSE AND project_id IS NOT NULL")).rows;
    for (const c of cards) if (!stageById.has(String(c.project_id))) stageById.set(String(c.project_id), String(c.list ?? ""));
  } catch { /* table appears after the first Trello sync */ }
  try {
    const evs = (await db.execute("SELECT project_id, subject, start_at FROM calendar_events WHERE project_id IS NOT NULL ORDER BY start_at")).rows;
    for (const e of evs) {
      const pid = String(e.project_id);
      if (!nextEventById.has(pid)) nextEventById.set(pid, `${String(e.subject ?? "").slice(0, 32)} · ${String(e.start_at ?? "").slice(5, 10)}`);
    }
  } catch { /* table appears after the first calendar sync */ }
  // money progress: collected vs current bid, from the payments feed
  const collectedById = new Map<string, number>();
  try {
    const pays = (await db.execute("SELECT project_id, SUM(amount) AS total FROM payments GROUP BY project_id")).rows;
    for (const r of pays) collectedById.set(String(r.project_id), Number(r.total ?? 0));
  } catch { /* payments table arrives with the QB pipe */ }

  // top-of-home rollup — book value of what's active, collected against it, and the headcounts
  const activeValue = active.reduce((sum, x) => sum + (x.value || 0), 0);
  const collected = active.reduce((sum, x) => sum + (collectedById.get(x.id) ?? 0), 0);

  return (
    <section className="view">
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 0, alignItems: "flex-start" }}>
        <Link className="btn" href="/estimate-builder">+ New Estimate</Link>
      </div>

      <WeatherBanner />

      <div className="home-bento">
        <div className="metric accent hero">
          <div className="v">{activeValue ? money(activeValue) : "—"}</div>
          <div className="k">Active book value</div>
        </div>
        <div className="metric">
          <div className="v">{active.length}</div>
          <div className="k">Active jobs</div>
        </div>
        <div className="metric">
          <div className="v">{collected ? money(collected) : "—"}</div>
          <div className="k">Collected</div>
        </div>
        <div className="metric wide">
          <div className="v">{s.projects}</div>
          <div className="k">Total projects</div>
        </div>
      </div>

      <div className="sec-h">Active now</div>
      <div className="proj-cards">
        {active.length ? (
          active.slice(0, 6).map((x) => (
            <Link key={x.id} href={`/projects/${x.id}`} className="pcard">
              <div className="pc-top">
                <div className="pc-name">{x.name}</div>
                {stageById.get(x.id) && <span className="badge bid">{stageById.get(x.id)}</span>}
              </div>
              <div className="pc-val">{x.value ? money(x.value) : "—"}</div>
              <div className="pc-meta">
                <span>{x.type || "—"}</span><span className="pdot" />
                <span>{x.market || "—"}</span><span className="pdot" />
                <span>{x.estimates} bid{x.estimates === 1 ? "" : "s"}</span>
              </div>
              <div className="pc-meta" style={{ marginTop: 6 }}>
                {nextEventById.get(x.id) ? (
                  <span style={{ color: "var(--navy)", fontWeight: 600 }}>Next: {nextEventById.get(x.id)}</span>
                ) : (
                  <span>last activity {x.last || "—"}</span>
                )}
              </div>
              <PcProgress collected={collectedById.get(x.id) ?? 0} value={x.value} />
            </Link>
          ))
        ) : (
          <div className="sub">No active jobs right now.</div>
        )}
      </div>

      <div className="morelink">
        <Link href="/projects">View all {s.projects} projects →</Link>
      </div>

      <GbpReviews />
    </section>
  );
}

// collected-vs-bid progress bar on a project card; hides until the job has a bid value
function PcProgress({ collected, value }: { collected: number; value: number }) {
  if (!value) return null;
  const pct = Math.max(0, Math.min(100, Math.round((collected / value) * 100)));
  return (
    <div className="pc-progress">
      <div className="pc-progress-bar">
        <div className="pc-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <small>{pct}% collected{collected > 0 ? ` · ${money(collected)}` : ""}</small>
    </div>
  );
}
