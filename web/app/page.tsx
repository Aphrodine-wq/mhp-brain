import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { dashboardForRole } from "@/lib/role-nav";
import { stats, projectsList } from "@/lib/queries";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import CeoDashboard from "./_dashboards/CeoDashboard";
import SalesDashboard from "./_dashboards/SalesDashboard";

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

  return (
    <section className="view">
      <div className="row" style={{ justifyContent: "space-between", marginTop: 0, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>Projects</h2>
          <div className="sub" style={{ margin: "6px 0" }}>North Mississippi Home Pros</div>
        </div>
        <Link className="btn" href="/estimate-builder">+ New Estimate</Link>
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
            </Link>
          ))
        ) : (
          <div className="sub">No active jobs right now.</div>
        )}
      </div>

      <div className="morelink">
        <Link href="/projects">View all {s.projects} projects →</Link>
      </div>
    </section>
  );
}
