import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { currentUser } from "@/lib/auth";
import { dashboardForRole } from "@/lib/role-nav";
import { stats, projectsList } from "@/lib/queries";
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

  const overview = (
    <div className="stat-grid">
      <div className="metric">
        <div className="v sm">{active.length}</div>
        <div className="k">Active jobs</div>
      </div>
      <div className="metric">
        <div className="v sm">{s.bid}</div>
        <div className="k">Out for bid</div>
      </div>
    </div>
  );

  const jobs = (
    <>
      <div className="proj-cards">
        {active.length ? (
          active.slice(0, 6).map((x) => (
            <Link key={x.id} href={`/projects/${x.id}`} className="pcard">
              <div className="pc-top">
                <div className="pc-name">{x.name}</div>
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
    </>
  );

  return (
    <section className="view">
      <div className="wx-flex">
        <WeatherBanner />
        <div className="wx-flex-cta">
          <Link className="btn cta" href="/estimate-builder">
            <Plus size={16} weight="bold" />
            New Estimate
          </Link>
        </div>
      </div>

      {overview}

      <div className="sec-h">Active now</div>
      {jobs}

      <GbpReviews />
    </section>
  );
}
