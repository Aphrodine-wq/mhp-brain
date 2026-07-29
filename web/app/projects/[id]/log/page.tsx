import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { getJobEvents } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import { eventsForProject } from "@/lib/calendar";
import EventLogForm, { type JobEvent } from "../EventLogForm";

export const dynamic = "force-dynamic";

export default async function ProjectLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const canWrite = !!(await requireRole("editor"));
  const [jobEvents, events] = await Promise.all([
    getJobEvents(id).catch(() => []) as Promise<unknown> as Promise<JobEvent[]>,
    eventsForProject(id).catch(() => []),
  ]);

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href={`/projects/${id}`}>← {proj.name}</Link>
      </div>
      <h2>Job log</h2>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Log an event</h3>
        <EventLogForm projectId={id} events={jobEvents} canWrite={canWrite} />
      </div>

      {events.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Coming up</h3>
          {events.map((ev, i) => (
            <div className="setrow" key={i}>
              <div>
                <div className="sl">
                  {ev.webLink ? <a href={ev.webLink} target="_blank" rel="noreferrer" className="cell-link">{ev.subject}</a> : ev.subject}
                </div>
                {ev.location && <div className="sd">{ev.location}</div>}
              </div>
              <span className="sd" style={{ whiteSpace: "nowrap" }}>
                {ev.startAt.slice(0, 10)}{ev.isAllDay ? "" : ` · ${ev.startAt.slice(11, 16)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
