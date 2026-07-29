"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";
import { post } from "@/lib/client";
import CollapseSection from "../_components/CollapseSection";

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
  // biggest groups first; "Other" always last
  const groups = [...byType.entries()].sort((a, b) =>
    (a[0] === "Other" ? 1 : 0) - (b[0] === "Other" ? 1 : 0) || b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  return (
    <>
      {groups.map(([type, rows]) => (
        <TypeSection key={type} type={type} rows={rows} busy={busy} setStatus={setStatus} />
      ))}
    </>
  );
}

function TypeSection({
  type,
  rows,
  busy,
  setStatus,
}: {
  type: string;
  rows: ProjectRow[];
  busy: string | null;
  setStatus: (p: ProjectRow, status: string) => void;
}) {
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <CollapseSection
      title={type}
      summary={`${rows.length} project${rows.length === 1 ? "" : "s"} · ${money(total)}`}
    >
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
    </CollapseSection>
  );
}
