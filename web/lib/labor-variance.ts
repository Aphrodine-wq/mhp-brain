import { db } from "@/lib/db";

// Phase 2 — estimate-vs-actual labor variance per job.
//
// The loop this closes: every finished job should make the next bid smarter —
// "you bid $X labor, the crew actually cost $Y, adjust." The two sides:
//
//   ESTIMATED labor ($) — extracted here from the saved estimate's line items.
//     Clean labor lines ("Framing Labor", "Interior Paint Labor") count 100%.
//     Combined "Material & Labor" lines ("Plumbing Material & Labor", "Shower
//     Door (Included Material & Labor)") count their labor fraction only.
//     [Decision 2026-06-25: split combined lines by a fixed fraction.]
//
//   ACTUAL labor ($) — book-accurate, straight from QuickBooks per-job cost.
//     [Decision 2026-06-25: dollars-to-dollars from QB, no rate assumption.]
//     The QB pipe isn't authorized yet, so actual is null and the readout shows
//     "awaiting QuickBooks" — it lights up on first sync, same as Margin/Collected.
//
// Pure reads, no mutation — mirrors lib/margin.ts. Hours (lib/time.ts
// actualLaborHours) are NOT converted to dollars here on purpose: a fabricated
// rate would steer real bids, and James chose the book-accurate path.

// Fraction of a combined "Material & Labor" line that counts as labor.
// Single source of truth — tune here, never scatter the number.
export const COMBINED_LINE_LABOR_FRACTION = 0.4;

interface EstimateLine {
  description?: string | null;
  qty?: number | string | null;
  rate?: number | string | null;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

// The labor dollars a single estimate line contributes, by the rules above.
// Returns { labor, combined } so callers can show how the number was built.
export function lineLaborDollars(line: EstimateLine): { labor: number; combined: boolean } {
  const desc = String(line.description ?? "").toLowerCase();
  if (!/\blabor\b/.test(desc)) return { labor: 0, combined: false };

  const lineTotal = num(line.qty) * num(line.rate);
  // "Material & Labor", "material and labor", "(included material & labor)" → combined.
  const combined = /material/.test(desc);
  const labor = combined ? lineTotal * COMBINED_LINE_LABOR_FRACTION : lineTotal;
  return { labor, combined };
}

export interface EstimatedLabor {
  laborDollars: number;
  cleanLines: number; // count of clean labor lines (100%)
  combinedLines: number; // count of combined lines (fractional)
  hasEstimate: boolean;
}

// Estimated labor dollars from the latest saved estimate linked to this project.
export async function estimatedLabor(projectId: string): Promise<EstimatedLabor> {
  const empty: EstimatedLabor = { laborDollars: 0, cleanLines: 0, combinedLines: 0, hasEstimate: false };
  let lines: EstimateLine[] = [];
  try {
    const r = (await db.execute({
      sql: `SELECT lines FROM saved_estimates
            WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`,
      args: [projectId],
    })).rows[0];
    if (!r) return empty;
    const raw = r.lines;
    lines = typeof raw === "string" ? JSON.parse(raw) : (raw as EstimateLine[]) ?? [];
  } catch {
    return empty; // saved_estimates absent or unparseable — show nothing, never crash the page
  }
  if (!Array.isArray(lines) || lines.length === 0) return { ...empty, hasEstimate: true };

  let laborDollars = 0;
  let cleanLines = 0;
  let combinedLines = 0;
  for (const ln of lines) {
    const { labor, combined } = lineLaborDollars(ln);
    if (labor <= 0) continue;
    laborDollars += labor;
    if (combined) combinedLines++;
    else cleanLines++;
  }
  return { laborDollars, cleanLines, combinedLines, hasEstimate: true };
}

export interface LaborVariance {
  estimatedLabor: number | null;
  actualLabor: number | null; // book-accurate from QB; null until QB is connected
  varianceDollars: number | null; // actual − estimated (positive = over bid)
  variancePct: number | null; // variance / estimated
  cleanLines: number;
  combinedLines: number;
  status: "awaiting_quickbooks" | "no_estimate" | "ready";
}

// Estimate-vs-actual labor for one job. Estimated is live today; actual lands
// when QuickBooks is authorized (mirrors how margin.ts treats the payments table).
export async function laborVariance(projectId: string): Promise<LaborVariance> {
  const est = await estimatedLabor(projectId);
  const estimated = est.hasEstimate && est.laborDollars > 0 ? est.laborDollars : null;

  // Actual labor cost, dollars-to-dollars from QB. The QB→web cost pipe isn't
  // wired yet, so this stays null and the panel reads "awaiting QuickBooks".
  // When the pipe lands, populate actual here (same try/catch shape as payments).
  let actual: number | null = null;
  try {
    const r = (await db.execute({
      sql: `SELECT labor_cost FROM qb_job_costs WHERE project_id = ? LIMIT 1`,
      args: [projectId],
    })).rows[0];
    if (r && r.labor_cost != null) actual = Number(r.labor_cost);
  } catch {
    /* qb_job_costs arrives with the QB pipe — until then, actual is unknown */
  }

  const varianceDollars = estimated != null && actual != null ? actual - estimated : null;
  const variancePct = varianceDollars != null && estimated ? varianceDollars / estimated : null;
  const status: LaborVariance["status"] = estimated == null ? "no_estimate" : actual == null ? "awaiting_quickbooks" : "ready";

  return {
    estimatedLabor: estimated,
    actualLabor: actual,
    varianceDollars,
    variancePct,
    cleanLines: est.cleanLines,
    combinedLines: est.combinedLines,
    status,
  };
}
