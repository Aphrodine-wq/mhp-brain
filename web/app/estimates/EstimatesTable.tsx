"use client";

import { useState } from "react";
import Link from "next/link";
import type { EstimateRow } from "@/lib/queries";
import { money } from "@/lib/format";
import { yearOf } from "../_components/CollapseSection";

// parse_confidence -> badge color (unknown values fall back to grey)
const CONF: Record<string, string> = {
  HIGH: "active",
  MEDIUM: "aging",
  PARTIAL: "bid",
  LOW: "dead",
};

type Cat = "All" | "Residential" | "Commercial";

export default function EstimatesTable({ estimates }: { estimates: EstimateRow[] }) {
  const [f, setF] = useState("");
  const [cat, setCat] = useState<Cat>("All");
  const q = f.toLowerCase();

  const residential = estimates.filter((e) => e.category === "Residential");
  const commercial = estimates.filter((e) => e.category === "Commercial");

  const list = estimates
    .filter((e) => cat === "All" || e.category === cat)
    .filter((e) => e.project.toLowerCase().includes(q) || e.source.toLowerCase().includes(q))
    // newest first; undated sink to the bottom
    .sort((a, b) => (yearOf(b.date) === "No date" ? "0" : yearOf(b.date)).localeCompare(yearOf(a.date) === "No date" ? "0" : yearOf(a.date)) || a.project.localeCompare(b.project));

  return (
    <>
      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="metric"><div className="v sm">{estimates.length}</div><div className="k">Total estimates</div></div>
        <div className="metric"><div className="v sm">{residential.length}</div><div className="k">Residential</div></div>
        <div className="metric"><div className="v sm">{commercial.length}</div><div className="k">Commercial</div></div>
      </div>

      <div className="filterbar">
        <input placeholder="Filter by project or file…" value={f} onChange={(e) => setF(e.target.value)} />
        {(["All", "Residential", "Commercial"] as Cat[]).map((c) => (
          <button key={c} className={`chip${cat === c ? " active" : ""}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="card">
        <table className="dtable">
          <thead>
            <tr>
              <th>Project</th>
              <th>Date</th>
              <th>Category</th>
              <th>Source</th>
              <th className="n">Line items</th>
              <th className="n">Total</th>
              <th>Parse</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty" style={{ padding: "32px 20px" }}>No estimates match.</div>
                </td>
              </tr>
            )}
            {list.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/estimates/${e.id}`} className="cell-link">{e.project}</Link></td>
                <td>{e.date || "—"}</td>
                <td><span className={`badge ${e.category === "Commercial" ? "bid" : "unknown"}`}>{e.category}</span></td>
                <td>
                  {e.hasDoc ? (
                    <a
                      href={`/api/estimates/${e.id}/document`}
                      title={`Download original: ${e.source}`}
                      style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                    >
                      {e.source || "Document"} ↓
                    </a>
                  ) : (
                    <small
                      className="j"
                      title={e.source}
                      style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                    >
                      {e.source || "—"}
                    </small>
                  )}
                </td>
                <td className="n">{e.lineItems}</td>
                <td className="n">{e.total ? money(e.total) : "—"}</td>
                <td>
                  <span className={`badge ${CONF[e.confidence] || "unknown"}`}>{e.confidence || "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
