"use client";

import { useState } from "react";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";

export default function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const [f, setF] = useState("");
  const list = projects.filter((p) => p.name.toLowerCase().includes(f.toLowerCase()));
  const activeCount = projects.filter((p) => p.status === "Active").length;

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
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.market || "—"}</td>
                <td>{p.type || "—"}</td>
                <td><span className={`badge ${BADGE[p.status] || "unknown"}`}>{p.status}</span></td>
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
