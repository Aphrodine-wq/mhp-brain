"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Trello returns the member token in the URL FRAGMENT of return_url (never sent to the
// server), so this page exists to catch it client-side and hand it to /api/trello/connect.
export default function TrelloCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Connecting Trello…");

  /* eslint-disable react-hooks/set-state-in-effect -- the token only exists in the URL fragment, readable post-mount */
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
      setStatus("No token returned — Trello may have been denied.");
      const t = setTimeout(() => router.replace("/integrations?oauth=error-trello"), 1500);
      return () => clearTimeout(t);
    }
    (async () => {
      const r = await fetch("/api/trello/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      router.replace(r.ok ? "/integrations?oauth=connected-trello" : "/integrations?oauth=error-trello");
    })();
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <section className="view">
      <div style={{ textAlign: "center", padding: 80 }}>
        <div className="spin" />
        <div style={{ color: "var(--muted)" }}>{status}</div>
      </div>
    </section>
  );
}
