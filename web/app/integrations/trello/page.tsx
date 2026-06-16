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
      const detail = "Trello returned no token — the API key may be wrong, or access wasn't approved.";
      setStatus(detail);
      const t = setTimeout(
        () => router.replace(`/integrations?oauth=error-trello&detail=${encodeURIComponent(detail)}`),
        1500,
      );
      return () => clearTimeout(t);
    }
    (async () => {
      const r = await fetch("/api/trello/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (r.ok) {
        router.replace("/integrations?oauth=connected-trello");
        return;
      }
      const data = await r.json().catch(() => ({}));
      const detail = (data as { error?: string }).error ?? "Connection failed.";
      router.replace(`/integrations?oauth=error-trello&detail=${encodeURIComponent(detail)}`);
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
