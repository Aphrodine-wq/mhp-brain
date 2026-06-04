"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";
import { post } from "@/lib/client";

const STATUSES = ["Active", "Aging", "Bid", "Paused", "Likely Done", "Dead", "Unknown"];

export default function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [f, setF] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = projects.filter((p) => p.name.toLowerCase().includes(f.toLowerCase()));
  const activeCount = projects.filter((p) => p.status === "Active").length;

  async function setStatus(p: ProjectRow, status: string) {
    if (status === p.status) return;
    setBusy(p.id);
    try {
      await post("/api/override/status", { id: p.id, status, name: p.name });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="filterbar">
        <input placeholder="Filter projects…" value={f} onChange={(e) => setF(e.target.value)} />
        <span className="sub" style={{ margin: 0 }}>{list.length} shown · {activeCount} active now</span>
      </div>
      <div className="card">
        <table className="dtable">
          <thead>
            <tr>
              <th>Project</th><th>Market</th><th>Type</th><th>Status</th><th>Last activity</th>
              <th className="n">Est. Value</th><th className="n">Bids</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    <div className="big">No projects match</div>
                    Clear the filter to see all jobs.
                  </div>
                </td>
              </tr>
            )}
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.market || "—"}</td>
                <td>{p.type || "—"}</td>
                <td>
                  <select
                    className={`badge ${BADGE[p.status] || "unknown"}`}
                    value={p.status}
                    disabled={busy === p.id}
                    onChange={(e) => setStatus(p, e.target.value)}
                    style={{ border: 0, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}
                    title="Change status — saved as a correction"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>{p.last || "—"}</td>
                <td className="n">{p.value ? money(p.value) : "—"}</td>
                <td className="n">{p.estimates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
