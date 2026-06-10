"use client";

import { useState } from "react";

// Teams channel alerts — webhook status + a test button so wiring is verifiable in one click.
export default function AlertsPanel({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sendTest() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/alerts/test", { method: "POST" });
      const d = await r.json();
      setResult(r.ok ? "Test alert sent — check the channel." : d.error ?? "Test failed.");
    } catch {
      setResult("Couldn't reach the server.");
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Channel alerts</h3>
      <div className="setrow">
        <div className="conn-left">
          <div className="conn-icon">
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="0" y="0" width="24" height="24" rx="4" fill="#6264A7" />
              <rect x="4.5" y="6.5" width="11" height="11" rx="1.5" fill="#fff" />
              <path d="M7 9.5h6M10 9.5v6" stroke="#6264A7" strokeWidth="1.9" strokeLinecap="round" />
              <circle cx="18.5" cy="9" r="2.3" fill="#fff" opacity=".85" />
            </svg>
          </div>
          <div>
          <div className="sl">Teams alerts</div>
          <div className="sd">
            {configured
              ? "The brain posts to your Teams channel: Bid Guard overrides, new estimates saved."
              : "Set TEAMS_WEBHOOK_URL — in Teams: channel → Workflows → “Post to a channel when a webhook request is received”, paste the URL into the env."}
          </div>
          {result && <div className="sd">{result}</div>}
          </div>
        </div>
        <div className="actions">
          {configured ? <span className="badge active">Configured</span> : <span className="badge aging">Not set up</span>}
          {configured && (
            <button className="btn ghost sm" disabled={busy} onClick={sendTest}>
              {busy ? "Sending…" : "Send test alert"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
