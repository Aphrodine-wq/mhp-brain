"use client";

import { useState } from "react";
import type { EstimateRow } from "@/lib/queries";
import { money } from "@/lib/format";

// parse_confidence -> badge color (unknown values fall back to grey)
const CONF: Record<string, string> = {
  HIGH: "active",
  MEDIUM: "aging",
  PARTIAL: "bid",
  LOW: "dead",
};

export default function EstimatesTable({ estimates }: { estimates: EstimateRow[] }) {
  const [f, setF] = useState("");
  const q = f.toLowerCase();
  const list = estimates.filter(
    (e) => e.project.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
  );
  const total = list.reduce((s, e) => s + e.total, 0);

  return (
    <>
      <div className="filterbar">
        <input placeholder="Filter by project or file…" value={f} onChange={(e) => setF(e.target.value)} />
        <span className="sub" style={{ margin: 0 }}>
          {list.length} estimates · {money(total)} total
        </span>
      </div>
      <div className="card">
        <table className="dtable">
          <thead>
            <tr>
              <th>Project</th>
              <th>Date</th>
              <th>Source</th>
              <th className="n">Line items</th>
              <th className="n">Total</th>
              <th>Parse</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="big">No estimates yet</div>
                    Build one in the Estimate Builder and it shows up here.
                  </div>
                </td>
              </tr>
            ) : (
              list.map((e) => (
                <tr key={e.id}>
                  <td>{e.project}</td>
                  <td>{e.date || "—"}</td>
                  <td>
                    <small className="j">{e.source || "—"}</small>
                  </td>
                  <td className="n">{e.lineItems}</td>
                  <td className="n">{e.total ? money(e.total) : "—"}</td>
                  <td>
                    <span className={`badge ${CONF[e.confidence] || "unknown"}`}>{e.confidence || "—"}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
