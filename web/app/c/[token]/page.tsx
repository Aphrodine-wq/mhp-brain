import { resolveShareLink } from "@/lib/share";
import { clientPortalData } from "@/lib/client-portal";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

// PUBLIC route — intentionally does NOT call currentUser(). Access is the share token alone; the
// data comes only from clientPortalData (the safe projection).
export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const projectId = await resolveShareLink(token);
  const data = projectId ? await clientPortalData(projectId) : null;

  if (!data) {
    return (
      <div className="panel" style={{ padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>Link expired</h2>
        <div className="sub" style={{ margin: 0 }}>This project link is no longer active. Ask North Mississippi Home Pros for a fresh link.</div>
      </div>
    );
  }

  return (
    <section className="view" style={{ marginTop: 0 }}>
      <h2 style={{ margin: 0 }}>{data.name}</h2>
      <div className="sub" style={{ margin: "6px 0 0" }}>
        {data.clientName ? `Prepared for ${data.clientName}` : "Your project"}{data.address ? ` · ${data.address}` : ""}
      </div>

      {/* phase stepper */}
      {data.phaseIndex >= 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "20px 0 4px" }}>
          {data.phases.map((p, i) => {
            const done = i <= data.phaseIndex;
            return (
              <span key={p.key} style={{
                fontSize: 12.5, padding: "5px 11px", borderRadius: 20,
                background: done ? "var(--navy)" : "var(--paper)", color: done ? "#fff" : "var(--muted)",
                border: `1px solid ${done ? "var(--navy)" : "var(--line)"}`,
              }}>{p.label}</span>
            );
          })}
        </div>
      )}

      {/* payment schedule */}
      {data.schedule.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Payment schedule</h3>
          {data.schedule.map((s, i) => (
            <div className="setrow" key={i}>
              <div><div className="sl">{s.label}</div></div>
              <div className="actions">
                <span className="sd">{money(s.amount)}</span>
                <span className={`badge ${s.paid ? "active" : "aging"}`}>{s.paid ? "Paid" : "Due"}</span>
              </div>
            </div>
          ))}
          {data.contractValue ? (
            <div className="setrow"><div><div className="sl">Collected to date</div></div><div className="sd">{money(data.collected)} of {money(data.contractValue)}</div></div>
          ) : null}
        </div>
      )}

      {/* approved change orders */}
      {data.changeOrders.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Approved changes</h3>
          {data.changeOrders.map((c, i) => (
            <div className="setrow" key={i}>
              <div><div className="sl">{c.description}</div><div className="sd">{c.approvedDate ? `Approved ${c.approvedDate}` : "Approved"}</div></div>
              <div className="sd">{money(c.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {/* next inspection */}
      {data.nextInspection && (
        <div className="banner" style={{ marginTop: 18 }}>
          Next inspection: <b>{data.nextInspection.type}</b> on {data.nextInspection.date}
          {data.nextInspection.result && data.nextInspection.result !== "pending" ? ` · ${data.nextInspection.result}` : ""}
        </div>
      )}

      {/* progress milestones */}
      {data.milestones.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Progress</h3>
          {data.milestones.map((m, i) => (
            <div className="setrow" key={i}>
              <div><div className="sl">{m.summary}</div></div>
              <span className="sd" style={{ whiteSpace: "nowrap" }}>{m.date}</span>
            </div>
          ))}
        </div>
      )}

      {/* photos */}
      {data.photos.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Photos</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, padding: "4px 2px" }}>
            {data.photos.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer" title={p.caption ?? ""}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? "Job photo"} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
