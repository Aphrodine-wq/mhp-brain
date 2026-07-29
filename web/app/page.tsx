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
        <div className="k">Active projects</div>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <Greeting name={user.name} />
        <Link className="btn cta" href="/estimate-builder">
          <Plus size={16} weight="bold" />
          New Estimate
        </Link>
      </div>

      <WeatherBanner />

      {overview}

      <div className="sec-h">Active now</div>
      {jobs}

      <GbpReviews />
    </section>
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
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--navy)" }}>{date}</div>
      <h2 style={{ margin: "6px 0 0" }}>Good {part}, {name.split(" ")[0]}</h2>
    </div>
  );
}
