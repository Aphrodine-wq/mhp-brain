"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "@phosphor-icons/react";

// Every Teams alert the brain can fire, with its default. The two original alerts ship "on";
// the rest default "off" so turning the feature on doesn't suddenly flood the channel — the
// owner opts each event in. Each toggle is stored in integration_settings under provider "alerts"
// and read at the matching fire point (see lib/alerts.ts call sites).
const ALERTS: { key: string; label: string; hint: string; def: "on" | "off" }[] = [
  { key: "estimate_saved", label: "Estimate saved", hint: "When an estimate is saved.", def: "on" },
  { key: "bid_guard", label: "Bid Guard override", hint: "When someone sends an estimate under baseline.", def: "on" },
  { key: "payment_received", label: "Payment received", hint: "When a payment is recorded on a job.", def: "off" },
  { key: "change_order_new", label: "Change order submitted", hint: "When a change order is created.", def: "off" },
  { key: "change_order_decided", label: "Change order approved / rejected", hint: "When a change order is decided.", def: "off" },
  { key: "callback_new", label: "Warranty callback opened", hint: "When a callback is logged on a finished job.", def: "off" },
  { key: "inspection_scheduled", label: "Inspection scheduled", hint: "When a permit inspection date is set.", def: "off" },
];

export default function NotificationPrefs({
  initial,
  configured,
}: {
  initial: Record<string, string>;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const valueOf = (key: string, def: string) => initial[key] ?? def;

  async function toggle(key: string, next: string) {
    setBusy(key);
    await fetch("/api/integration-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "alerts", key, value: next }),
    });
    setBusy(null);
    router.refresh();
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/alerts/test", { method: "POST" });
      const d = await r.json();
      setTestResult(r.ok ? "Test alert sent — check the channel." : d.error ?? "Test failed.");
    } catch {
      setTestResult("Couldn't reach the server.");
    }
    setTesting(false);
  }

  return (
    <details className="panel settings-fold" style={{ marginTop: 18 }}>
      <summary><span className="fold-icon"><Bell size={18} /></span>Notifications</summary>

      {/* Teams webhook connection status + one-click test */}
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
            <div className="sl">Teams channel</div>
            <div className="sd">
              {configured
                ? "Alerts post to your Teams channel. Toggle the events below."
                : "Set TEAMS_WEBHOOK_URL — in Teams: channel → Workflows → “Post to a channel when a webhook request is received”, paste the URL into the env."}
            </div>
            {testResult && <div className="sd">{testResult}</div>}
          </div>
        </div>
        <div className="actions">
          {configured ? <span className="badge active">Configured</span> : <span className="badge aging">Not set up</span>}
          {configured && (
            <button className="btn ghost sm" disabled={testing} onClick={sendTest}>
              {testing ? "Sending…" : "Send test alert"}
            </button>
          )}
        </div>
      </div>

      {/* Per-event toggles */}
      {ALERTS.map((a) => {
        const v = valueOf(a.key, a.def);
        return (
          <div className="setrow" key={a.key}>
            <div>
              <div className="sl">{a.label}</div>
              <div className="sd">{a.hint}</div>
            </div>
            <div
              className={`toggle${v === "on" ? " on" : ""}`}
              aria-disabled={busy === a.key}
              onClick={() => toggle(a.key, v === "on" ? "off" : "on")}
            />
          </div>
        );
      })}
    </details>
  );
}
