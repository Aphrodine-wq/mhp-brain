// Client-facing document content: which lines are allowances, the scope-of-services
// derived from the estimate, and the slot for MHP's real contract language.
import { DIVISION_DETAIL } from "./line-detail";

const norm = (d: string | null | undefined) =>
  String(d ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// Lines that are budget allowances (selection-dependent), not fixed-scope work.
const ALLOWANCE_NAMES = new Set(["appliances", "plumbing fixtures"]);

/** A line is an allowance if it has no proven history (jobs 0) or is a known selection allowance. */
export function isAllowance(line: { description: string; jobs: number }): boolean {
  return line.jobs === 0 || ALLOWANCE_NAMES.has(norm(line.description));
}

export interface ScopeItem {
  division: string;
  summary: string;
}

/** Scope of Services: one bullet per division present in the estimate, in CSI order. */
export function scopeOfServices(divisions: string[]): ScopeItem[] {
  const seen = new Set<string>();
  const out: ScopeItem[] = [];
  for (const d of divisions) {
    const key = norm(d).split(":").pop()?.trim() ?? norm(d);
    if (!d || seen.has(key)) continue;
    seen.add(key);
    const summary = DIVISION_DETAIL[key] ?? DIVISION_DETAIL[norm(d)] ?? "";
    if (summary) out.push({ division: d.replace(/^Division\s*\d+:\s*/, ""), summary });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT TERMS — REPLACE THIS PLACEHOLDER WITH MHP'S REAL CONTRACT LANGUAGE.
// Paste the company's reviewed Construction Agreement text here (or load it from a
// config/CMS later). Until then this clearly-marked stub renders so the packet is
// complete in layout. Have counsel review before any client signs.
// ─────────────────────────────────────────────────────────────────────────────
export const CONTRACT_TERMS: { heading: string; body: string }[] = [
  {
    heading: "1. The Work",
    body: "Contractor agrees to furnish the labor, materials, and services described in the attached Scope of Services and Estimate for the Project identified on the cover page.",
  },
  {
    heading: "2. Contract Sum & Allowances",
    body: "Owner agrees to pay the Contract Sum shown on the Estimate. Allowance items (see Project Allowances) are budget figures; the Contract Sum is adjusted up or down by change order as selections are finalized.",
  },
  {
    heading: "3. Payment Schedule",
    body: "Payments are due by phase per the draw schedule, with a deposit due at signing. ‹MHP to specify draw milestones and percentages.›",
  },
  {
    heading: "4. Changes in the Work",
    body: "Any change to scope, selections, or quantities is documented by written change order signed by both parties before the work proceeds, adjusting the Contract Sum and schedule accordingly.",
  },
  {
    heading: "5. Schedule",
    body: "Contractor will substantially complete the Work within the timeframe stated, subject to weather, inspections, material availability, and Owner-directed changes.",
  },
  {
    heading: "6. Warranty",
    body: "Contractor warrants the Work per MHP's standard warranty and the Mississippi licensing terms. ‹MHP warranty period and terms to be inserted.›",
  },
  {
    heading: "7. Exclusions",
    body: "Items listed as Not Included on the Estimate are excluded from the Contract Sum and the Work.",
  },
  {
    heading: "‼ PLACEHOLDER",
    body: "This is standard scaffolding, not MHP's reviewed contract. Replace with the company's actual Construction Agreement language (lib/documents.ts → CONTRACT_TERMS) and have counsel review before use.",
  },
];
