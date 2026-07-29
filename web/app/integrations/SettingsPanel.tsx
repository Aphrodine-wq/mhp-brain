"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-integration knobs — each value is read by its sync at run time.
const FIELDS: { provider: string; key: string; label: string; hint: string; kind: "number" | "toggle" | "text" }[] = [
  { provider: "microsoft", key: "calendar_days", label: "Calendar window (days)", hint: "How far ahead the calendar sync looks. Default 30.", kind: "number" },
  { provider: "weather", key: "lat", label: "Job market latitude", hint: "Forecast location. Default Oxford, MS.", kind: "text" },
  { provider: "weather", key: "lon", label: "Job market longitude", hint: "Default -89.5192.", kind: "text" },
];

export default function SettingsPanel({ values }: { values: Record<string, Record<string, string>> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const cur = (p: string, k: string, fallback: string) => local[`${p}.${k}`] ?? values[p]?.[k] ?? fallback;

  async function save(provider: string, key: string, value: string) {
    setBusy(`${provider}.${key}`);
    await fetch("/api/integration-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key, value }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <details className="panel settings-fold" style={{ marginTop: 18 }}>
      <summary>Integration settings</summary>
      {FIELDS.map((f) => {
        const id = `${f.provider}.${f.key}`;
        const fallback = f.kind === "toggle" ? "on" : "";
        const v = cur(f.provider, f.key, fallback);
        return (
          <div className="setrow" key={id}>
            <div>
              <div className="sl">{f.label}</div>
              <div className="sd">{f.hint}</div>
            </div>
            {f.kind === "toggle" ? (
              <div
                className={`toggle${v === "on" ? " on" : ""}`}
                onClick={() => save(f.provider, f.key, v === "on" ? "off" : "on")}
              />
            ) : (
              <div style={{ whiteSpace: "nowrap" }}>
                <input
                  className="mk"
                  style={{ width: 110 }}
                  value={v}
                  onChange={(e) => setLocal((l) => ({ ...l, [id]: e.target.value }))}
                />{" "}
                <button className="btn ghost sm" disabled={busy === id} onClick={() => save(f.provider, f.key, cur(f.provider, f.key, fallback))}>
                  Save
                </button>
              </div>
            )}
          </div>
        );
      })}
    </details>
  );
}
