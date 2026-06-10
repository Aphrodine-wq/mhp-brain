"use client";

import { useState } from "react";
import Link from "next/link";
import type { EstimateRow } from "@/lib/queries";
import { money } from "@/lib/format";
import CollapseSection, { yearOf, sortYears } from "../_components/CollapseSection";

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
  const residential = list.filter((e) => e.category === "Residential");
  const commercial = list.filter((e) => e.category === "Commercial");

  return (
    <>
      <div className="filterbar">
        <input placeholder="Filter by project or file…" value={f} onChange={(e) => setF(e.target.value)} />
        <span className="sub" style={{ margin: 0 }}>
          {list.length} estimates · {money(total)} total
        </span>
      </div>
      <CategorySection title="Residential" rows={residential} filtering={q !== ""} />
      <CategorySection title="Commercial" rows={commercial} filtering={q !== ""} />
    </>
  );
}

function CategorySection({ title, rows, filtering }: { title: string; rows: EstimateRow[]; filtering: boolean }) {
  const total = rows.reduce((s, e) => s + e.total, 0);
  const byYear = new Map<string, EstimateRow[]>();
  for (const e of rows) {
    const y = yearOf(e.date);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }
  const years = sortYears([...byYear.keys()]);
  return (
    <CollapseSection
      title={title}
      summary={`${rows.length} estimate${rows.length === 1 ? "" : "s"} · ${money(total)}`}
      forceOpen={filtering}
    >
      {rows.length === 0 && (
        <div className="empty" style={{ padding: "32px 20px" }}>No {title.toLowerCase()} estimates match.</div>
      )}
      {years.map((y) => (
        <YearSection key={y} year={y} rows={byYear.get(y)!} filtering={filtering} />
      ))}
    </CollapseSection>
  );
}

function YearSection({ year, rows, filtering }: { year: string; rows: EstimateRow[]; filtering: boolean }) {
  const total = rows.reduce((s, e) => s + e.total, 0);
  return (
    <CollapseSection
      nested
      title={year}
      summary={`${rows.length} estimate${rows.length === 1 ? "" : "s"} · ${money(total)}`}
      forceOpen={filtering}
    >
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
            {rows.map((e) => (
                <tr key={e.id}>
                  <td><Link href={`/estimates/${e.id}`} className="cell-link">{e.project}</Link></td>
                  <td>{e.date || "—"}</td>
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
    </CollapseSection>
  );
}
