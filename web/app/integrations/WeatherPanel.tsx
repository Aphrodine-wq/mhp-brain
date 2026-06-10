"use client";

import { useState } from "react";

// NWS forecast — keyless government API. The schedule-a-pour check.
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
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Job-site weather</h3>
      <div className="setrow">
        <div className="conn-left">
          <div className="conn-icon">
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="9" cy="9" r="4.5" fill="#FBBC04" />
              <path d="M7 18a4.2 4.2 0 0 1 .4-8.4 5.4 5.4 0 0 1 10.4 1.5A3.5 3.5 0 0 1 17.5 18z" fill="#9bb7e6" stroke="#5b87c9" strokeWidth=".8" />
            </svg>
          </div>
          <div>
            <div className="sl">NWS forecast (no key needed)</div>
            <div className="sd">Seven-day outlook for the job market — rain days flagged before you schedule a pour.</div>
            {error && <div className="sd">{error}</div>}
          </div>
        </div>
        <div className="actions">
          <span className="badge active">Ready</span>
          <button className="btn ghost sm" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check forecast"}</button>
        </div>
      </div>
      {days && days.map((d, i) => (
        <div className="setrow" key={i}>
          <div>
            <div className="sl">{d.name}</div>
            <div className="sd">{d.forecast}</div>
          </div>
          <div className="actions">
            <span className="sd">{d.temp}°</span>
            {d.rain >= 40 ? <span className="badge dead">{d.rain}% rain</span> : <span className="badge active">{d.rain}%</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
