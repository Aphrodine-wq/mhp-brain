"use client";

import Link from "next/link";
import type { EstimateRow } from "@/lib/queries";
import { money } from "@/lib/format";
import { yearOf } from "../_components/CollapseSection";

export default function EstimatesTable({ estimates }: { estimates: EstimateRow[] }) {
  // newest first; undated sink to the bottom
  const list = [...estimates].sort(
    (a, b) =>
      (yearOf(b.date) === "No date" ? "0" : yearOf(b.date)).localeCompare(yearOf(a.date) === "No date" ? "0" : yearOf(a.date)) ||
      a.project.localeCompare(b.project),
  );

  return (
    <div className="card" style={{ marginTop: 18 }}>
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
          {list.length === 0 && (
            <tr>
              <td colSpan={4}>
                <div className="empty" style={{ padding: "32px 20px" }}>No estimates match.</div>
              </td>
            </tr>
          )}
          {list.map((e) => (
            <tr key={e.id}>
              <td><Link href={`/estimates/${e.id}`} className="cell-link">{e.project}</Link></td>
              <td>{e.date || "—"}</td>
              <td><span className={`badge ${e.category === "Commercial" ? "bid" : "unknown"}`}>{e.category}</span></td>
              <td className="n">{e.total ? money(e.total) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
