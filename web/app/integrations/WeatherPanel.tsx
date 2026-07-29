"use client";

import { useState } from "react";
import { CloudSun } from "@phosphor-icons/react";

// NWS forecast — keyless government API. The schedule-a-pour check.
// Renders as a card in the Connected services grid (imported by Connections).
export default function WeatherPanel() {
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState<{ name: string; temp: number; rain: number; forecast: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const d = await (await fetch("/api/weather")).json();
      if (!d.ok) throw new Error(d.error);
      setDays(d.days);
    } catch {
      setError("weather.gov unreachable — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="conn-card">
      <div className="conn-card-head">
        <div className="conn-icon" style={{ color: "var(--navy)" }}><CloudSun size={22} /></div>
        <div className="conn-title">
          <div className="sl">Job-site weather</div>
          <span className="badge active">Ready</span>
        </div>
      </div>
      <div className="sd conn-desc">
        Seven-day outlook — rain days flagged before you pour.
        {error && <div>{error}</div>}
      </div>
      <div className="conn-actions">
        <button className="btn ghost sm" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check forecast"}</button>
      </div>
      {days && (
        <div style={{ marginTop: 4 }}>
          {days.map((d, i) => (
            <div className="pay-row" key={i}>
              <span>{d.name}</span>
              <span className="pay-pct">{d.temp}°</span>
              <b className={d.rain >= 40 ? "wx-wet" : undefined}>{d.rain}%</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
