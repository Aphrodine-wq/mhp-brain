"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackedMaterial } from "@/lib/price-sensor";
import { money } from "@/lib/format";
import CollapseSection from "../_components/CollapseSection";

const fmt = (n: number | null) => (n == null ? "—" : n >= 100 ? money(n) : `$${n.toFixed(2)}`);

// trade group from the mapped estimator line — same dropdown organization as the rest of the app
const GROUPS: [RegExp, string][] = [
  [/framing|porch|post|column/i, "Lumber & Framing"],
  [/drywall|interior paint|interior trim/i, "Drywall, Paint & Trim"],
  [/lvt|floor tile|backsplash/i, "Flooring & Tile"],
  [/insulation|roofing|siding|gutter/i, "Envelope & Roofing"],
  [/slab|forming|block|footing/i, "Concrete & Masonry"],
  [/window|door/i, "Openings"],
  [/cabinet|countertop|vanit/i, "Casework & Counters"],
  [/plumbing|water heater/i, "Plumbing"],
  [/hvac/i, "HVAC"],
  [/electrical|lighting/i, "Electrical"],
];
const groupOf = (m: TrackedMaterial) => GROUPS.find(([re]) => re.test(m.catalogDesc))?.[1] ?? "Other";

// drift of recent MHP rate vs all-time baseline — the "are we keeping up" number
function drift(m: TrackedMaterial): number | null {
  if (m.rateRecent == null || m.rateBaseline == null || m.rateBaseline === 0) return null;
  return Math.round(((m.rateRecent - m.rateBaseline) / m.rateBaseline) * 100);
}

export default function PricingTable({ materials }: { materials: TrackedMaterial[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [catalogDesc, setCatalogDesc] = useState("");
  const [priceEdit, setPriceEdit] = useState<Record<string, string>>({});

  async function run() {
    setBusy("run");
    setResult(null);
    try {
      const d = await (await fetch("/api/pricing/run", { method: "POST" })).json();
      setResult(d.ok ? `Recomputed rates for ${d.updated} materials from estimate history.` : d.error ?? "Run failed.");
      router.refresh();
    } catch {
      setResult("Couldn't reach the server.");
    }
    setBusy(null);
  }

  async function add() {
    if (!name.trim()) return;
    setBusy("add");
    await fetch("/api/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, unit, catalogDesc }),
    });
    setName(""); setUnit(""); setCatalogDesc(""); setAdding(false); setBusy(null);
    router.refresh();
  }

  async function saveMarket(id: string) {
    const v = parseFloat(priceEdit[id]);
    if (!Number.isFinite(v) || v <= 0) return;
    setBusy(id);
    await fetch("/api/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, marketPrice: v }),
    });
    setPriceEdit((p) => ({ ...p, [id]: "" }));
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    await fetch(`/api/pricing?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      <div className="row">
        <button className="btn" disabled={busy !== null} onClick={run}>
          {busy === "run" ? "Running…" : "Run — recompute MHP rates"}
        </button>
        <button className="btn ghost" onClick={() => setAdding((a) => !a)}>+ Track material</button>
        {result && <span className="sub" style={{ margin: 0 }}>{result}</span>}
      </div>

      {adding && (
        <div className="asm-inputs" style={{ marginBottom: 16 }}>
          <label>Material<input type="text" style={{ width: 200 }} value={name} placeholder="Architectural shingles" onChange={(e) => setName(e.target.value)} /></label>
          <label>Unit<input type="text" style={{ width: 110 }} value={unit} placeholder="square" onChange={(e) => setUnit(e.target.value)} /></label>
          <label>Estimator line<input type="text" style={{ width: 240 }} value={catalogDesc} placeholder="Shingle Roofing Material" onChange={(e) => setCatalogDesc(e.target.value)} /></label>
          <button className="btn" disabled={busy === "add" || !name.trim()} onClick={add}>Add</button>
        </div>
      )}

      {(() => {
        const byGroup = new Map<string, TrackedMaterial[]>();
        for (const m of materials) {
          const g = groupOf(m);
          if (!byGroup.has(g)) byGroup.set(g, []);
          byGroup.get(g)!.push(m);
        }
        const order = [...byGroup.keys()].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
        return order.map((g) => {
          const rows = byGroup.get(g)!;
          const noFeed = rows.filter((m) => m.marketPrice == null).length;
          const stale = rows.filter((m) => m.stale).length;
          const parts = [`${rows.length} material${rows.length === 1 ? "" : "s"}`];
          if (stale) parts.push(`${stale} stale`);
          if (noFeed) parts.push(`${noFeed} no feed`);
          return (
            <CollapseSection key={g} title={g} summary={parts.join(" · ")}>
        <table className="dtable">
          <thead>
            <tr>
              <th>Material</th><th>Estimator line</th>
              <th className="n">Market</th><th className="n">MHP 12-mo</th><th className="n">Baseline</th>
              <th>Drift</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const d = drift(m);
              return (
                <tr key={m.id}>
                  <td>
                    <b>{m.name}</b>
                    <div><small className="j">per {m.unit || "unit"}</small></div>
                  </td>
                  <td><small className="j">{m.catalogDesc || "—"}</small></td>
                  <td className="n">
                    {m.marketPrice != null ? (
                      <>
                        {fmt(m.marketPrice)}
                        {m.stale && (
                          <span className="badge aging" style={{ marginLeft: 6 }}>stale</span>
                        )}
                        <div><small className="j">{m.marketUpdatedAt}{m.marketSource ? ` · ${m.marketSource}` : ""}</small></div>
                      </>
                    ) : (
                      <span className="badge unknown">no feed</span>
                    )}
                    <div style={{ marginTop: 4, whiteSpace: "nowrap" }}>
                      <input
                        className="mk"
                        style={{ width: 86 }}
                        placeholder="set $"
                        value={priceEdit[m.id] ?? ""}
                        onChange={(e) => setPriceEdit((p) => ({ ...p, [m.id]: e.target.value }))}
                      />{" "}
                      <button className="btn ghost sm" disabled={busy === m.id || !priceEdit[m.id]} onClick={() => saveMarket(m.id)}>Set</button>
                    </div>
                  </td>
                  <td className="n">{fmt(m.rateRecent)}</td>
                  <td className="n">{fmt(m.rateBaseline)}</td>
                  <td>
                    {d == null ? (
                      <span className="badge unknown">—</span>
                    ) : d > 5 ? (
                      <span className="badge active">+{d}% charging more</span>
                    ) : d < -5 ? (
                      <span className="badge dead">{d}% falling behind</span>
                    ) : (
                      <span className="badge bid">{d >= 0 ? "+" : ""}{d}% steady</span>
                    )}
                  </td>
                  <td className="n"><button className="x" disabled={busy === m.id} onClick={() => remove(m.id)} title="Stop tracking">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
            </CollapseSection>
          );
        });
      })()}

      <div className="morelink">
        Market prices land automatically from the price scraper (POST /api/pricing/ingest, HMAC-signed) or get typed in here.
      </div>
    </>
  );
}
