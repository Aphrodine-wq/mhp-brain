"use client";

import { useState } from "react";

// Owner control: generate / copy / revoke a public client-portal link for this job.
export default function ShareLink({ projectId, hasActive }: { projectId: string; hasActive: boolean }) {
  const [active, setActive] = useState(hasActive);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/share`, { method: "POST" });
      const d = await r.json();
      if (r.ok && d.path) {
        const abs = `${window.location.origin}${d.path}`;
        setUrl(abs);
        setActive(true);
        await navigator.clipboard.writeText(abs).then(() => setCopied(true)).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/share`, { method: "DELETE" });
      setActive(false);
      setUrl(null);
      setCopied(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="btn ghost sm" disabled={busy} onClick={generate}>
        {busy ? "Working…" : active ? "Regenerate client link" : "Share with client"}
      </button>
      {active && (
        <button className="btn ghost sm" disabled={busy} onClick={revoke}>Revoke</button>
      )}
      {url && (
        <span className="sd" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>
          {copied ? "Copied — " : ""}{url}
        </span>
      )}
    </div>
  );
}
