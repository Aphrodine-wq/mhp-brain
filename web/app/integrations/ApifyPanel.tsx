"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Robot } from "@phosphor-icons/react";

// Apify — the scraping backend for material-price feeds. Token saves through the shared
// integration-settings endpoint and is read server-side by the scraper jobs.
export default function ApifyPanel({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!token.trim()) return;
    setBusy(true);
    await fetch("/api/integration-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "apify", key: "token", value: token.trim() }),
    });
    setBusy(false);
    setSaved(true);
    setToken("");
    router.refresh();
  }

  const ok = configured || saved;

  return (
    <div className="conn-card">
      <div className="conn-card-head">
        <div className="conn-icon" style={{ color: "var(--navy)" }}><Robot size={22} /></div>
        <div className="conn-title">
          <div className="sl">Apify</div>
          {ok ? <span className="badge active">Configured</span> : <span className="badge unknown">Not set up</span>}
        </div>
      </div>
      <div className="sd conn-desc">Scraping backend for material-price feeds. Paste your API token to connect.</div>
      <div className="conn-actions">
        <input
          className="mk"
          style={{ width: 220 }}
          type="password"
          placeholder={ok ? "Token saved — paste to replace" : "apify_api_…"}
          value={token}
          onChange={(e) => { setToken(e.target.value); setSaved(false); }}
        />
        <button className="btn ghost sm" disabled={busy || !token.trim()} onClick={save}>
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save token"}
        </button>
      </div>
    </div>
  );
}
