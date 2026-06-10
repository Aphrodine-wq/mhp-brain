"use client";

import { useState } from "react";

// Pre-bid site check — flood zone for any address, straight from Census + FEMA.
export default function SiteCheckPanel() {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ matched: string; floodZone: string; highRisk: boolean; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    if (!address.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const d = await (await fetch(`/api/sitecheck?address=${encodeURIComponent(address)}`)).json();
      if (!d.ok) throw new Error(d.error);
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "check failed");
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Site check (FEMA flood zone)</h3>
      <div className="setrow">
        <div style={{ flex: 1 }}>
          <div className="sl">Pre-bid flood lookup</div>
          <div className="sd">Census + FEMA, no keys. Zone A or V means flood insurance and elevation — know before you bid.</div>
          {error && <div className="conn-err" style={{ marginTop: 8 }}>{error}</div>}
          {result && (
            <div className="sd" style={{ marginTop: 8 }}>
              {result.matched} —{" "}
              <span className={`badge ${result.highRisk ? "dead" : "active"}`}>Zone {result.floodZone}</span>{" "}
              {result.note}
            </div>
          )}
        </div>
        <div className="actions">
          <input className="mk" style={{ width: 240 }} placeholder="123 County Rd 101, Oxford, MS" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button className="btn ghost sm" disabled={busy || !address.trim()} onClick={check}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
    </div>
  );
}
