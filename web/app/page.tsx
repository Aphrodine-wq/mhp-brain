import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { dashboardForRole } from "@/lib/role-nav";
import { stats, projectsList } from "@/lib/queries";
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

  return (
    <section className="view">
      <div className="row" style={{ justifyContent: "space-between", marginTop: 0, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>Projects</h2>
          <div className="sub" style={{ margin: "6px 0" }}>North Mississippi Home Pros</div>
        </div>
        <Link className="btn" href="/estimates">+ New Estimate</Link>
      </div>

      <div className="stat-strip">
        <div><div className="sv">{s.active}</div><div className="sk">Active jobs</div></div>
        <div><div className="sv">{money(s.active_value)}</div><div className="sk">Active book value</div></div>
        <div><div className="sv">{s.bid}</div><div className="sk">Bids out</div></div>
      </div>

      <div className="sec-h">Active now</div>
      <div className="proj-cards">
        {active.length ? (
          active.slice(0, 6).map((x) => (
            <Link key={x.id} href={`/projects/${x.id}`} className="pcard">
              <div className="pc-top">
                <div className="pc-name">{x.name}</div>
              </div>
              <div className="pc-val">{x.value ? money(x.value) : "—"}</div>
              <div className="pc-meta">
                <span>{x.market || "—"}</span><span className="pdot" />
                <span>{x.last || "—"}</span>
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
