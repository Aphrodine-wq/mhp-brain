"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";
import { post } from "@/lib/client";
import CollapseSection, { yearOf, sortYears } from "../_components/CollapseSection";

const STATUSES = ["Active", "Aging", "Bid", "Paused", "Likely Done", "Dead", "Unknown"];

export default function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [f, setF] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const q = f.toLowerCase();
  const list = projects.filter((p) => p.name.toLowerCase().includes(q));
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
  const byYear = new Map<string, ProjectRow[]>();
  for (const p of rows) {
    const y = yearOf(p.last);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(p);
  }
  const years = sortYears([...byYear.keys()]);
  return (
    <CollapseSection
      title={title}
      summary={`${rows.length} project${rows.length === 1 ? "" : "s"} · ${money(total)}`}
      forceOpen={filtering}
    >
      {rows.length === 0 && (
        <div className="empty" style={{ padding: "32px 20px" }}>No {title.toLowerCase()} projects match.</div>
      )}
      {years.map((y) => (
        <YearSection key={y} year={y} rows={byYear.get(y)!} filtering={filtering} busy={busy} setStatus={setStatus} />
      ))}
    </CollapseSection>
  );
}

function YearSection({
  year,
  rows,
  filtering,
  busy,
  setStatus,
}: {
  year: string;
  rows: ProjectRow[];
  filtering: boolean;
  busy: string | null;
  setStatus: (p: ProjectRow, status: string) => void;
}) {
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <CollapseSection
      nested
      title={year}
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
          {rows.map((p) => (
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
          ))}
        </tbody>
      </table>
    </CollapseSection>
  );
}
