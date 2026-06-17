import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { crewList, projectsList } from "@/lib/queries";
import { recentEntries, hoursByJob } from "@/lib/time";
import TimeForm from "./TimeForm";

export const dynamic = "force-dynamic";

export default async function TimePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const canWrite = user.role === "ceo" || user.role === "admin" || user.role === "editor";

  const [crew, projects, entries, byJob] = await Promise.all([
    crewList().catch(() => []),
    projectsList().catch(() => []),
    recentEntries(30).catch(() => []),
    hoursByJob().catch(() => []),
  ]);

  return (
    <section className="view">
      <h2>Time</h2>

      <TimeForm
        canWrite={canWrite}
        workers={crew.map((c) => c.name)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        entries={entries}
      />

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Hours by job</h3>
        {byJob.length === 0 ? (
          <div className="empty" style={{ padding: "28px 20px" }}>
            <div className="big">No hours yet</div>
            Log time above and each job&apos;s total rolls up here.
          </div>
        ) : (
          byJob.map((r) => (
            <div className="setrow" key={String(r.project_id)}>
              <div>
                <div className="sl">{String(r.project_name)}</div>
                <div className="sd">{Number(r.entries)} entries</div>
              </div>
              <div className="actions">
                <span className="sl" style={{ whiteSpace: "nowrap" }}>{Number(r.hours)}h</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
