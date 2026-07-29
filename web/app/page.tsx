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
    <div className="home-bento">
      <div className="metric accent hero">
        <div className="v">{active.length}</div>
        <div className="k">Active jobs</div>
      </div>
      <div className="metric wide">
        <div className="v">{s.bid}</div>
        <div className="k">Out for bid</div>
      </div>
      <div className="metric wide">
        <div className="v">{s.projects}</div>
        <div className="k">Total projects</div>
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
              <PcPhaseProgress phase={x.phase} status={x.status} />
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
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 0, alignItems: "flex-start" }}>
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

// Phase-based progress — how far along the job is, not money. Falls back to a coarse
// status guess when the job has no phase set yet.
const PHASE_STEPS: Record<string, { label: string; pct: number }> = {
  lead: { label: "Lead", pct: 10 },
  quoted: { label: "Quoted", pct: 30 },
  scheduled: { label: "Scheduled", pct: 45 },
  in_progress: { label: "In progress", pct: 70 },
  complete: { label: "Complete", pct: 100 },
  paid: { label: "Complete", pct: 100 },
};

function PcPhaseProgress({ phase, status }: { phase: string; status: string }) {
  const step = PHASE_STEPS[phase] ?? { label: status === "Aging" ? "Aging" : "Active", pct: status === "Aging" ? 85 : 55 };
  return (
    <div className="pc-progress">
      <div className="pc-progress-top">
        <span>{step.label}</span>
        <span>{step.pct}%</span>
      </div>
      <div className="pc-progress-bar">
        <div className="pc-progress-fill" style={{ width: `${step.pct}%` }} />
      </div>
    </div>
  );
}
