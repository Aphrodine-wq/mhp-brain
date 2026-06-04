import { liveData } from "@/lib/queries";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const d = await liveData();

  return (
    <section className="view">
      <h2>Live</h2>
      <div className="sub">
        A forward look on active jobs — where each one&apos;s priced against your own history and what needs
        attention. The thing no off-the-shelf tool has: your estimate brain watching your live jobs.
      </div>

      <div className="banner">
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#0b3d91" strokeWidth={2}>
          <path d="M12 8v4l3 2" /><circle cx={12} cy={12} r={9} />
        </svg>
        <span>
          <b>Live margin forecast</b> — predicting each job&apos;s final margin before it&apos;s done — activates
          when actual-cost / invoice data connects. Today Live runs on bid pricing + activity.
        </span>
      </div>

      <div className="prio-panel">
        <h3>Today — derived priorities</h3>
        <div>
          {d.priorities.length ? (
            d.priorities.slice(0, 8).map(([lvl, t], i) => (
              <div key={i} className="prio"><span className={`fdot ${lvl}`} /><span>{t}</span></div>
            ))
          ) : (
            <div className="prio">Nothing flagged. All active jobs look clean.</div>
          )}
        </div>
      </div>

      <div className="sec-h" style={{ marginTop: 0 }}>Active jobs — health</div>
      <div className="living-grid">
        {d.jobs.map((j, i) => {
          let gauge: React.ReactNode = null;
          if (j.delta !== null) {
            const d2 = Math.max(-30, Math.min(30, j.delta));
            const w = (Math.abs(d2) / 30) * 50;
            const col = j.delta < -4 ? "#c0392b" : j.delta > 8 ? "#2f9e44" : "#d99a2b";
            const fill: React.CSSProperties =
              j.delta < 0 ? { right: "50%", width: `${w}%`, background: col } : { left: "50%", width: `${w}%`, background: col };
            gauge = (
              <div className="gauge">
                <div className="gauge-lab">
                  <span>Priced vs your norm</span>
                  <b style={{ color: col }}>{j.delta > 0 ? "+" : ""}{j.delta}%</b>
                </div>
                <div className="gauge-bar"><div className="gauge-mid" /><div className="gauge-fill" style={fill} /></div>
              </div>
            );
          }
          return (
            <div key={i} className={`living ${j.health}`}>
              <div className="living-top">
                <div className="lname">{j.name}</div>
                <div className="lval">{j.value ? money(j.value) : "—"}</div>
              </div>
              <div className="lmeta">{j.market || "—"} · {j.last || "—"} · {j.revisions} bid{j.revisions === 1 ? "" : "s"}</div>
              {gauge}
              {j.flags.length ? (
                j.flags.map(([lvl, t], k) => (
                  <div key={k} className="flag"><span className={`fdot ${lvl}`} /><span>{t}</span></div>
                ))
              ) : (
                <div className="flag"><span className="fdot green" /><span>On track — no flags.</span></div>
              )}
              <div className="forecast">Margin forecast: <b>locked</b> until invoices connect</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
