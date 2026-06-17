// Client-facing document content: which lines are allowances, the scope-of-services
// derived from the estimate, and the slot for MHP's real contract language.
import { DIVISION_DETAIL } from "./line-detail";

const norm = (d: string | null | undefined) =>
  String(d ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// Lines that are budget allowances (selection-dependent), not fixed-scope work. The
// appliance/fixture/lighting families are flagged as allowances in their own catalog
// detail text; lines whose catalog unit is literally "allowance" are caught by unit.
const ALLOWANCE_NAMES = new Set([
  "appliances",
  "kitchen appliances",
  "laundry appliances",
  "plumbing fixtures",
  "lighting fixtures",
]);

/** A line is an allowance if it has no proven history (jobs 0), is priced per "allowance"
 *  unit, or is a known selection allowance. Saved estimates have no jobs count — pass unit. */
export function isAllowance(line: { description: string; jobs?: number; unit?: string | null }): boolean {
  return line.jobs === 0 || norm(line.unit) === "allowance" || ALLOWANCE_NAMES.has(norm(line.description));
}

// ─────────────────────────────────────────────────────────────────────────────
// FINISH SELECTIONS (Schedule A) — the items the owner actually picks. Each is a
// line already priced in the estimate; this is a second VIEW of those lines, not
// a second charge. The budgeted amount is the material/fixture side (labor lines
// stay in the estimate and never appear here). Over a budget → change order +12%;
// under → credit (contract Articles 2 & 4).
//
// Keyed by canon(description) — the same normalization the catalog uses — so the
// proven catalog line descriptions map straight onto a client-facing category.
// ─────────────────────────────────────────────────────────────────────────────
export const FINISH_CATEGORY_ORDER = [
  "Cabinetry",
  "Countertops & Backsplash",
  "Flooring",
  "Tile & Surrounds",
  "Plumbing Fixtures",
  "Lighting",
  "Appliances",
  "Doors & Hardware",
  "Windows",
  "Interior Paint & Color",
  "Exterior Finish",
] as const;

export type FinishCategory = (typeof FINISH_CATEGORY_ORDER)[number];

// canon(description) → finish category. Only material/fixture/selection lines are
// listed; labor lines (e.g. "countertop labor") are intentionally absent.
const FINISH_CATEGORIES: Record<string, FinishCategory> = {
  "kitchen cabinets": "Cabinetry",
  "laundry cabinets": "Cabinetry",
  "cabinet & drawer hardware": "Cabinetry",
  "countertop material": "Countertops & Backsplash",
  "backsplash material": "Countertops & Backsplash",
  "lvt flooring - materials": "Flooring",
  "floor tile": "Flooring",
  "shower tile": "Tile & Surrounds",
  "plumbing fixtures": "Plumbing Fixtures",
  "lighting fixtures": "Lighting",
  appliances: "Appliances",
  "kitchen appliances": "Appliances",
  "laundry appliances": "Appliances",
  "interior doors": "Doors & Hardware",
  "exterior doors": "Doors & Hardware",
  "door hardware": "Doors & Hardware",
  windows: "Windows",
  "interior paint material": "Interior Paint & Color",
  "siding material": "Exterior Finish",
  "shingle roofing material": "Exterior Finish",
};

/** The finish category a line belongs to (for Schedule A), or null if it isn't a
 *  client-selectable finish. */
export function classifyFinish(description: string): FinishCategory | null {
  return FINISH_CATEGORIES[norm(description)] ?? null;
}

export interface FinishItem {
  description: string;
  amount: number;
}
export interface FinishGroup {
  category: FinishCategory;
  items: FinishItem[];
  total: number;
}

/** Group any line shape into the finish-selection schedule. Callers supply the
 *  description + budgeted amount accessors so this stays decoupled from the two
 *  line types (PacketLine and the PDF's EstimateLineItem). Empty groups dropped;
 *  output follows FINISH_CATEGORY_ORDER. */
export function groupFinishSelections<T>(
  lines: T[],
  getDescription: (l: T) => string,
  getAmount: (l: T) => number,
): FinishGroup[] {
  const byCategory = new Map<FinishCategory, FinishItem[]>();
  for (const line of lines) {
    const category = classifyFinish(getDescription(line));
    if (!category) continue;
    const amount = getAmount(line);
    if (!(amount > 0)) continue;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push({ description: getDescription(line), amount });
  }
  const out: FinishGroup[] = [];
  for (const category of FINISH_CATEGORY_ORDER) {
    const items = byCategory.get(category);
    if (!items?.length) continue;
    out.push({ category, items, total: items.reduce((s, i) => s + i.amount, 0) });
  }
  return out;
}

// MS sales-tax rate applied to the bid on the client-facing total. Single source for
// BOTH the HTML packet and the PDF packet so they never diverge. NOTE: confirm the
// rate/applicability for residential construction with Josh's accountant — this is the
// figure the HTML packet has always used; it's now shared rather than duplicated.
export const MS_SALES_TAX_PCT = 7;

/** Bid (marked-up sell, pre-tax) → { tax, grand } with the tax-inclusive total. */
export function applySalesTax(bid: number, taxPct: number = MS_SALES_TAX_PCT): { taxPct: number; tax: number; grand: number } {
  const tax = bid * (taxPct / 100);
  return { taxPct, tax, grand: bid + tax };
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
// CONTRACT — MHP's actual Professional Services Construction Contract Agreement,
// templatized from the company's executed contracts (Goodwiller/Prime Construction).
// Client-specific values (amount, allowances, names) fill from the estimate; the
// clause language is MHP's own. Confirm the entity address/details before sending.
// ─────────────────────────────────────────────────────────────────────────────
export const MHP_CONTRACTOR = {
  entity: "North Mississippi Home Professionals, LLC",
  address: "1501 W. Jackson Avenue, Suite 113 #144, Oxford, MS 38655",
  license: "MS Residential Builder R21909",
  signers: ["Josh Harris, Contractor — R21909", "Rick D. Burge, Operating Manager / Project Manager"],
};

const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ContractInput {
  total: number;
  allowanceTotal: number;
  clientName: string;
  address: string;
}

/** MHP's real 11-article construction contract, with amounts filled from the estimate. */
export function buildContractArticles(i: ContractInput): { heading: string; body: string }[] {
  const deposit = i.total * 0.2;
  const final = i.total * 0.05;
  const mid = (i.total - deposit - final) / 2;
  return [
    {
      heading: "Recitals",
      body: `This Professional Services Construction Contract Agreement is between ${MHP_CONTRACTOR.entity} (the "Contractor"), a licensed and insured Mississippi construction professional, and ${i.clientName || "the Client"} (the "Client" or "Owner"), for construction and remodeling work at ${i.address || "the Property"}. In consideration of the mutual covenants herein, the parties agree as follows.`,
    },
    {
      heading: "Article 1 — Scope of Work",
      body: "The Contractor agrees to provide all labor, materials, equipment, and services necessary to complete the Work described in the attached Scope of Services and Estimate. The complete scope is described in the Scope of Services document, Schedule A (Allowance Schedule), Schedule B (Payment Schedule), the Fixed Cost with Allowances Disclosure, and any written change orders executed by both parties, all incorporated by reference.",
    },
    {
      heading: "Article 2 — Contract Price",
      body: `The total contract price for the Work shall be ${usd(i.total)}. The Contract Amount includes allowances totaling ${usd(i.allowanceTotal)} for materials and fixtures (Schedule A). The Client shall make all selections within the allowance amounts; costs exceeding allowances are paid by the Client as a change order plus a 12% markup for overhead and profit, and any unused allowance is credited to the Client in the final payment.`,
    },
    {
      heading: "Article 2.3 — Payment Schedule",
      body: `Payments are made per Schedule B: Initial Deposit ${usd(deposit)} (20%, due at signing); progress draws of ${usd(mid)} each at agreed phase completions (rough-in and finish); and a Final payment ${usd(final)} (5%) at project completion. All payments are due within five (5) business days of invoice; late payments may result in work stoppage and/or a late fee of 1.5% per month. Accepted: check, cash, bank transfer, or credit card (3% processing fee on cards).`,
    },
    {
      heading: "Article 3 — Time of Performance",
      body: "Work shall commence within five (5) business days after receipt of the initial deposit and all necessary permits. The Contractor shall achieve Substantial Completion within the timeframe stated in the Estimate, subject to weather, material availability, Client-caused delays, or circumstances beyond the Contractor's reasonable control. Final Completion follows within seven (7) days of Substantial Completion upon final paint, cleaning, and punchlist.",
    },
    {
      heading: "Article 4 — Change Orders",
      body: "No changes to the Work shall be made without a written change order signed by both parties, specifying the change, any adjustment to the Contract Amount, and any schedule adjustment. Selections exceeding allowance amounts are treated as change orders billed with a 12% markup, and the Client is notified of potential overages before purchase or installation.",
    },
    {
      heading: "Article 5 — Warranties",
      body: "The Contractor warrants all Work to be performed in a professional and workmanlike manner, free from defects in workmanship for one (1) year from Final Completion. Materials and fixtures carry their manufacturers' warranties, provided to the Client at Final Completion. The Contractor warrants the Work complies with applicable building codes in effect at the time of construction.",
    },
    {
      heading: "Article 6 — Insurance and Liability",
      body: "The Contractor maintains general liability and workers' compensation insurance as required by law; proof is available on request. The Contractor takes reasonable precautions to protect the Property and is responsible for damage caused by the negligence of the Contractor or its subcontractors.",
    },
    {
      heading: "Article 7 — Client Responsibilities",
      body: "The Client shall provide reasonable access to the Property and necessary utilities, make all material and fixture selections in a timely manner (within allowance amounts or be responsible for additional costs via change order), and keep the work area clear and accessible, removing and protecting personal belongings not involved in the construction area.",
    },
    {
      heading: "Article 8 — Termination",
      body: "Either party may terminate for cause on seven (7) days' written notice if the other fails to cure a material default within the notice period. The Client may terminate for convenience on fourteen (14) days' written notice, paying the Contractor for all Work performed to date plus reasonable demobilization costs and materials purchased or committed.",
    },
    {
      heading: "Article 9 — Binding Arbitration",
      body: "Any dispute arising out of or relating to this Contract shall be resolved through binding arbitration under the Mississippi Arbitration Act (Miss. Code Ann. § 11-15-1 et seq.) and the AAA Construction Industry Arbitration Rules, by a single arbitrator in Oxford, Mississippi. The arbitrator's decision is final and binding, enforceable in any Mississippi court of competent jurisdiction. The parties waive their right to a jury trial; this clause survives termination or completion of the Contract.",
    },
    {
      heading: "Articles 10–11 — Governing Law & General Provisions",
      body: "This Contract is governed by the laws of the State of Mississippi. It constitutes the entire agreement between the parties, supersedes all prior negotiations, and may be amended only by written instrument signed by both parties. If any provision is invalid, the remainder continues in effect. Neither party may assign this Contract without the other's prior written consent. Notices shall be in writing to the addresses set forth herein. Titles are for convenience only. By signing, both parties acknowledge and agree to the contents herein with full understanding.",
    },
  ];
}
