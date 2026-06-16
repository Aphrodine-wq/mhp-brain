import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { moneyRadar } from "@/lib/jobHealth";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function MoneyRadarPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Financial surface — CEO/admin only (same bar as the P&L pages).
  if (user.role !== "ceo" && user.role !== "admin") {
    return (
      <section className="view">
        <h2>Money Radar</h2>
        <div className="sub">This view is for owners and admins.</div>
      </section>
    );
  }

  const radar = await moneyRadar().catch(() => null);
  if (!radar) {
    return (
      <section className="view">
        <h2>Money Radar</h2>
        <div className="sub">Couldn&apos;t load job financials. Connect QuickBooks and run a sync, then check back.</div>
      </section>
    );
  }

  const bleeding = radar.jobs.filter((j) => j.bleeding > 0 || j.deposit_missing);

  return (
    <section className="view">
      <h2>Money Radar</h2>
      <div className="sub">
        Where MHP is leaking money, worst-first. Every number is collectable or recoverable —
        unbilled change orders, missing deposits, and margin you&apos;re leaving on the table.
      </div>

      {/* Portfolio totals */}
      <div className="cards" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
        <div className="panel" style={{ flex: 1, minWidth: 200 }}>
          <div className="sd">Unbilled change orders</div>
          <div className="big" style={{ fontSize: 28 }}>{money(radar.total_unbilled_co)}</div>
          <div className="sd">approved, not yet invoiced — money already earned</div>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 200 }}>
          <div className="sd">Jobs missing a deposit</div>
          <div className="big" style={{ fontSize: 28 }}>{radar.jobs_missing_deposit}</div>
          <div className="sd">signed work with no deposit recorded</div>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 200 }}>
          <div className="sd">Recoverable margin</div>
          <div className="big" style={{ fontSize: 28 }}>{money(radar.total_recoverable_margin)}</div>
          <div className="sd">underpriced vs your own history</div>
        </div>
      </div>

      {/* Worst-first job list */}
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Bleeding jobs, worst-first</h3>
        {bleeding.length === 0 ? (
          <div className="empty" style={{ padding: "28px 20px" }}>
            <div className="big">Nothing bleeding</div>
            No unbilled change orders or missing deposits on live jobs. (Connect QuickBooks +
            log change orders to widen what this sees.)
          </div>
        ) : (
          bleeding.map((j) => (
            <div className="setrow" key={j.id}>
              <div>
                <div className="sl">{j.name}</div>
                <div className="sd">
                  {j.status}
                  {j.contract_value ? ` · ${money(j.contract_value)} job` : ""}
                  {j.actual_labor_hours > 0 ? ` · ${j.actual_labor_hours}h logged` : ""}
                  {j.flags.length > 0 ? ` · ${j.flags.join(" · ")}` : ""}
                </div>
              </div>
              <div className="actions">
                {j.bleeding > 0 && (
                  <span className="sl" style={{ whiteSpace: "nowrap" }}>{money(j.bleeding)}</span>
                )}
                {j.deposit_missing && <span className="badge aging">No deposit</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
