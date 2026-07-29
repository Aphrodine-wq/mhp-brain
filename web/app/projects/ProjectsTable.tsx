"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder } from "@phosphor-icons/react";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";
import { post } from "@/lib/client";

const STATUSES = ["Active", "Aging", "Bid", "Paused", "Likely Done", "Dead", "Unknown"];

// Grouping key: the first type listed on the job ("Kitchen Remodel; Bathroom" → "Kitchen Remodel").
// Type strings are messy imports; the primary segment is the honest read of what the job IS.
function primaryType(p: ProjectRow): string {
  const t = (p.type || "").split(";")[0].trim();
  return t || "Other";
}

export default function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

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

  const byType = new Map<string, ProjectRow[]>();
  for (const p of projects) {
    const t = primaryType(p);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(p);
  }
  // biggest groups first; unclassified catch-alls always last
  const tail = (t: string) => (t === "Other" || t === "Unclassified" ? 1 : 0);
  const groups = [...byType.entries()].sort((a, b) =>
    tail(a[0]) - tail(b[0]) || b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  // door cards first, like Pricing — drill into one type at a time
  if (!openGroup) {
    return (
      <div className="type-grid" style={{ marginTop: 22 }}>
        {groups.map(([type, rows]) => (
          <button key={type} className="type-card" onClick={() => setOpenGroup(type)}>
            <span className="type-icon"><Folder size={22} /></span>
            <span>{type}</span>
            <span className="type-sub">{rows.length} project{rows.length === 1 ? "" : "s"}</span>
          </button>
        ))}
      </div>
    );
  }

  const rows = byType.get(openGroup) ?? [];
  return (
    <div style={{ marginTop: 18 }}>
      <button className="btn ghost sm" onClick={() => setOpenGroup(null)}>← All types</button>
      <h3 style={{ margin: "14px 0 4px", fontFamily: "var(--disp)", fontSize: 20 }}>{openGroup}</h3>
      <table className="dtable">
        <thead>
          <tr>
            <th>Project</th><th>Market</th><th>Status</th><th>Last activity</th>
            <th className="n">Est. Value</th><th className="n">Bids</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/projects/${p.id}`} className="cell-link">{p.name}</Link></td>
                <td>{p.market || "—"}</td>
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
  );
}
