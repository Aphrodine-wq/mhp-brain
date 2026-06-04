"use client";

import { useState } from "react";
import type { SubRow } from "@/lib/queries";

export default function SubsTable({ subs }: { subs: SubRow[] }) {
  const [f, setF] = useState("");
  const list = subs.filter((x) => (x.name + " " + x.trade).toLowerCase().includes(f.toLowerCase()));

  return (
    <>
      <div className="filterbar">
        <input placeholder="Filter subs…" value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <div className="card">
        <table className="dtable">
          <thead>
            <tr><th>Name</th><th>Trade / Type</th><th>Phone</th><th className="n">Jobs</th><th>Source</th></tr>
          </thead>
          <tbody>
            {list.map((x, i) => (
              <tr key={i}>
                <td><b>{x.name}</b></td>
                <td>{x.trade || "—"}</td>
                <td>{x.phone || "—"}</td>
                <td className="n">{x.jobs || "—"}</td>
                <td><small className="j">{x.source}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
