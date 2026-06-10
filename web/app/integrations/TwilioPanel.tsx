"use client";

import { useState } from "react";

// Twilio comms log — env-configured (account SID + auth token), no OAuth dance.
export default function TwilioPanel({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/twilio/sync", { method: "POST" });
      const d = await r.json();
      setResult(r.ok ? `${d.messages} texts, ${d.calls} calls — ${d.matched} matched to subs/crew.` : d.error ?? "Sync failed.");
    } catch {
      setResult("Couldn't reach the server.");
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Phone &amp; SMS</h3>
      <div className="setrow">
        <div className="conn-left">
          <div className="conn-icon">
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="12" fill="#F22F46" />
              <circle cx="9" cy="9" r="2.1" fill="#fff" />
              <circle cx="15" cy="9" r="2.1" fill="#fff" />
              <circle cx="9" cy="15" r="2.1" fill="#fff" />
              <circle cx="15" cy="15" r="2.1" fill="#fff" />
            </svg>
          </div>
          <div>
          <div className="sl">Twilio</div>
          <div className="sd">
            {configured
              ? "Texts and calls on the company line, matched to subs and crew on their pages."
              : "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the env to pull the company line's texts and calls."}
          </div>
          {result && <div className="sd">{result}</div>}
          </div>
        </div>
        <div className="actions">
          {configured ? <span className="badge active">Configured</span> : <span className="badge aging">Not set up</span>}
          {configured && (
            <button className="btn ghost sm" disabled={busy} onClick={sync}>
              {busy ? "Syncing…" : "Sync log"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
