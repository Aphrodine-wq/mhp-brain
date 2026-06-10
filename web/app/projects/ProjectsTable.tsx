"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";
import { post } from "@/lib/client";
import CollapseSection from "../_components/CollapseSection";

const STATUSES = ["Active", "Aging", "Bid", "Paused", "Likely Done", "Dead", "Unknown"];

export default function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [f, setF] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const q = f.toLowerCase();
  const list = projects.filter((p) => p.name.toLowerCase().includes(q));
  const activeCount = projects.filter((p) => p.status === "Active").length;
  const residential = list.filter((p) => p.category === "Residential");
  const commercial = list.filter((p) => p.category === "Commercial");

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
      <CategorySection title="Residential" rows={residential} filtering={q !== ""} busy={busy} setStatus={setStatus} />
      <CategorySection title="Commercial" rows={commercial} filtering={q !== ""} busy={busy} setStatus={setStatus} />
    </>
  );
}

function CategorySection({
  title,
  rows,
  filtering,
  busy,
  setStatus,
}: {
  title: string;
  rows: ProjectRow[];
  filtering: boolean;
  busy: string | null;
  setStatus: (p: ProjectRow, status: string) => void;
}) {
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <CollapseSection
      title={title}
      summary={`${rows.length} project${rows.length === 1 ? "" : "s"} · ${money(total)}`}
      forceOpen={filtering}
    >
      <table className="dtable">
        <thead>
          <tr>
            <th>Project</th><th>Market</th><th>Type</th><th>Status</th><th>Last activity</th>
            <th className="n">Est. Value</th><th className="n">Bids</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <div className="empty" style={{ padding: "32px 20px" }}>
                  No {title.toLowerCase()} projects match.
                </div>
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/projects/${p.id}`} className="cell-link">{p.name}</Link></td>
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
            ))
          )}
        </tbody>
      </table>
    </CollapseSection>
  );
}
