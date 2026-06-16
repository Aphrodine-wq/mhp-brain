"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Fires the same /api/trello/sync the Integrations page uses, then refreshes the
// server component so the freshly-pulled cards render. CEO-gated server-side.
export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function sync() {
    setBusy(true);
    setMsg("");
    try {
      const data = await (await fetch("/api/trello/sync", { method: "POST" })).json();
      if (!data.ok) {
        setMsg(data.error ?? "Sync had a problem. Try again.");
      } else {
        setMsg(`${data.matched} of ${data.cards} cards matched across ${data.boards} board(s).`);
        router.refresh();
      }
    } catch {
      setMsg("Sync had a problem. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="actions" style={{ alignItems: "center", gap: 10 }}>
      {msg ? <span className="sd">{msg}</span> : null}
      <button className="btn" onClick={sync} disabled={busy}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
