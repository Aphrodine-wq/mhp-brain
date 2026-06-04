import { margin } from "@/lib/queries";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MarginPage() {
  const d = await margin();
  const mkTotal = d.markup.reduce((s, m) => s + m.uplift, 0);
  const head: [string, string, string][] = [
    ["accent", money(d.recoverable + mkTotal), "Total recoverable"],
    ["", money(mkTotal), "From thin markup"],
    ["", money(d.recoverable), "From underpriced lines"],
  ];

  return (
    <section className="view">
      <h2>Margin</h2>
      <div className="sub">
        Where you&apos;re leaving money on the table — measured against <b>your own history</b>, not some
        national average. &quot;Recoverable&quot; = what you&apos;d add by pricing to your own median.
      </div>

      <div className="dash-grid">
        {head.map(([c, v, k], i) => (
          <div key={i} className={`metric ${c}`}>
            <div className="v">{v}</div>
            <div className="k">{k}</div>
          </div>
        ))}
      </div>

      <div className="cols">
        <div className="panel">
          <h3>Markup — jobs bid thin</h3>
          <div>
            {d.markup.length ? (
              d.markup.map((m, i) => (
                <div key={i} className="prow">
                  <span className="pn">{m.name} <small className="j">{m.status} · {m.markup}% markup</small></span>
                  <span className="pv" style={{ color: "#2f6b34", fontWeight: 600 }}>+{money(m.uplift)}</span>
                </div>
              ))
            ) : (
              <div className="prow">Every job bid at or above your norm. Clean.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <h3>Line items you underprice</h3>
          <div className="card" style={{ border: 0, boxShadow: "none" }}>
            <table className="dtable">
              <thead>
                <tr><th>Item</th><th className="n">Jobs</th><th className="n">Typ. under</th><th className="n">Recoverable</th></tr>
              </thead>
              <tbody>
                {d.items.map((it, k) => (
                  <tr key={k}>
                    <td>{it.item}</td>
                    <td className="n">{it.jobs}</td>
                    <td className="n">{it.under}%</td>
                    <td className="n" style={{ color: "#2f6b34", fontWeight: 600 }}>{money(it.recoverable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="morelink">
        Numbers exclude data-entry artifacts (brick/tile unit slips). This is &quot;stop charging less than your
        own middle,&quot; not &quot;charge more than ever.&quot;
      </div>
    </section>
  );
}
