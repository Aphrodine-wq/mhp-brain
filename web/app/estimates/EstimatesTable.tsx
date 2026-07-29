"use client";

import Link from "next/link";
import type { EstimateRow } from "@/lib/queries";
import { money } from "@/lib/format";
import CollapseSection, { yearOf, sortYears } from "../_components/CollapseSection";

export default function EstimatesTable({ estimates }: { estimates: EstimateRow[] }) {
  // group by estimate year, newest first, undated last
  const byYear = new Map<string, EstimateRow[]>();
  for (const e of estimates) {
    const y = yearOf(e.date);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }
  const years = sortYears([...byYear.keys()]);

  return (
    <>
      {years.map((y) => {
        const rows = byYear.get(y)!;
        const total = rows.reduce((s, e) => s + e.total, 0);
        return (
          <CollapseSection
            key={y}
            title={y}
            summary={`${rows.length} estimate${rows.length === 1 ? "" : "s"} · ${money(total)}`}
          >
            <table className="dtable">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th className="n">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/estimates/${e.id}`} className="cell-link">{e.project}</Link></td>
                    <td>{e.date || "—"}</td>
                    <td><span className={`badge ${e.category === "Commercial" ? "bid" : "unknown"}`}>{e.category}</span></td>
                    <td className="n">{e.total ? money(e.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapseSection>
        );
      })}
    </>
  );
}
