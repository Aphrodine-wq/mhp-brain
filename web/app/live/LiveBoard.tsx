"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LiveResult } from "@/lib/queries";
import { money } from "@/lib/format";
import { post } from "@/lib/client";

export default function LiveBoard({ data }: { data: LiveResult }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function dismiss(key: string, label: string) {
    setBusy(key);
    try {
      await post("/api/flag/dismiss", { key, label });
      router.refresh();
    } catch {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="prio-panel">
        <h3>Today — derived priorities</h3>
        <div>
          {data.priorities.length ? (
            data.priorities.slice(0, 8).map((p) => (
              <div key={p.key} className="prio">
                <span className={`fdot ${p.level}`} />
                <span style={{ flex: 1 }}>{p.text}</span>
                <button className="x" title="Dismiss" disabled={busy === p.key} onClick={() => dismiss(p.key, p.text)}>×</button>
              </div>
            ))
          ) : (
            <div className="prio">Nothing flagged. All active jobs look clean.</div>
          )}
        </div>
      </div>

      <div className="sec-h" style={{ marginTop: 0 }}>Active jobs — health</div>
      <div className="living-grid">
        {data.jobs.map((j, i) => {
          let gauge: React.ReactNode = null;
          if (j.delta !== null) {
            const d2 = Math.max(-30, Math.min(30, j.delta));
            const w = (Math.abs(d2) / 30) * 50;
            const col = j.delta < -4 ? "#c0392b" : j.delta > 8 ? "#2f9e44" : "#d99a2b";
            const fill: React.CSSProperties =
              j.delta < 0 ? { right: "50%", width: `${w}%`, background: col } : { left: "50%", width: `${w}%`, background: col };
            gauge = (
              <div className="gauge">
                <div className="gauge-lab">
                  <span>Priced vs your norm</span>
                  <b style={{ color: col }}>{j.delta > 0 ? "+" : ""}{j.delta}%</b>
                </div>
                <div className="gauge-bar"><div className="gauge-mid" /><div className="gauge-fill" style={fill} /></div>
              </div>
            );
          }
          return (
            <div key={i} className={`living ${j.health}`}>
              <div className="living-top">
                <div className="lname">{j.name}</div>
                <div className="lval">{j.value ? money(j.value) : "—"}</div>
              </div>
              <div className="lmeta">{j.market || "—"} · {j.last || "—"} · {j.revisions} bid{j.revisions === 1 ? "" : "s"}</div>
              {gauge}
              {j.flags.length ? (
                j.flags.map((f) => (
                  <div key={f.key} className="flag">
                    <span className={`fdot ${f.level}`} />
                    <span style={{ flex: 1 }}>{f.text}</span>
                    <button className="x" title="Dismiss" disabled={busy === f.key} onClick={() => dismiss(f.key, f.text)}>×</button>
                  </div>
                ))
              ) : (
                <div className="flag"><span className="fdot green" /><span>On track — no flags.</span></div>
              )}
              <div className="forecast">Margin forecast: <b>locked</b> until invoices connect</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
