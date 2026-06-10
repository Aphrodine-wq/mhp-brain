import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { trelloCardsForProject } from "@/lib/trello";
import { eventsForProject } from "@/lib/calendar";
import { money, BADGE } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONF: Record<string, string> = {
  HIGH: "active",
  MEDIUM: "aging",
  PARTIAL: "bid",
  LOW: "dead",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const trelloCards = await trelloCardsForProject(id).catch(() => []);
  const events = await eventsForProject(id).catch(() => []);

  return (
    <section className="view">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{proj.name}</h2>
        <span className={`badge ${BADGE[proj.status] || "unknown"}`}>{proj.status}</span>
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {proj.market || "—"} · {proj.type || "—"} · last activity {proj.last || "—"}
      </div>

      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href="/projects">← All projects</Link>
      </div>

      <div className="stat-strip">
        <div><div className="sv">{proj.value ? money(proj.value) : "—"}</div><div className="sk">Current bid value</div></div>
        <div><div className="sv">{proj.estimates.length}</div><div className="sk">Documents on file</div></div>
        <div><div className="sv">{proj.last || "—"}</div><div className="sk">Last activity</div></div>
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

      {trelloCards.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>On the board</h3>
          {trelloCards.map((c, i) => (
            <div className="setrow" key={i}>
              <div>
                <div className="sl"><a href={c.url} target="_blank" rel="noreferrer" className="cell-link">{c.name}</a></div>
                <div className="sd">{c.board}{c.due ? ` · due ${c.due}` : ""} · last activity {c.lastActivity}</div>
              </div>
              <span className="badge bid">{c.list || "—"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sec-h">Documents</div>
      <div className="card" style={{ marginTop: 16 }}>
        <table className="dtable">
          <thead>
            <tr>
              <th>Date</th><th>Source</th><th className="n">Line items</th>
              <th className="n">Total</th><th>Parse</th>
            </tr>
          </thead>
          <tbody>
            {proj.estimates.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <div className="big">No documents on file</div>
                    Nothing parsed for this job yet.
                  </div>
                </td>
              </tr>
            ) : (
              proj.estimates.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/estimates/${e.id}`} className="cell-link">{e.date || "View estimate"}</Link>
                  </td>
                  <td>
                    {e.hasDoc ? (
                      <a
                        href={`/api/estimates/${e.id}/document`}
                        title={`Download original: ${e.source}`}
                        style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                      >
                        {e.source || "Document"} ↓
                      </a>
                    ) : (
                      <small
                        className="j"
                        title={e.source}
                        style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                      >
                        {e.source || "—"}
                      </small>
                    )}
                  </td>
                  <td className="n">{e.lineItems}</td>
                  <td className="n">{e.total ? money(e.total) : "—"}</td>
                  <td>
                    <span className={`badge ${CONF[e.confidence] || "unknown"}`}>{e.confidence || "—"}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
