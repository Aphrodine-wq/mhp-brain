// mhp-brain schema → donor PDF types. The components under lib/pdf/ are ported verbatim
// from mshomepros and consume the donor app's shapes (types.ts); this file is the only
// place the two schemas meet. Keep the components portable — adapt here, never in them.

import type { Estimate, EstimateLineItem, Client, EstimateChangeOrder } from "./types";
import type { EstimateDetail } from "@/lib/queries";

// What the packet needs from the project's operational fields (getProjectOps row).
export interface PdfJobInfo {
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
}

// Project-level change order rows as stored by lib/operations.ts.
export interface PdfChangeOrderRow {
  id: number;
  description: string;
  amount: number;
  approved: number; // 0 pending, 1 approved, -1 rejected
  approved_date: string | null;
  created_at: string;
}

// "Division 3: Concrete" → 3. CSI item_no "3.30.53" parses to 3.3 — enough for
// groupByDivision (floors to the division) and stable in-division ordering.
const divNumber = (division: string): number => {
  const m = division.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
};

const lineTotal = (l: EstimateDetail["lines"][number]): number | null =>
  l.itemTotal ?? (l.qty != null && l.unitPrice != null ? l.qty * l.unitPrice : l.sovTotal);

export function toPdfLineItems(est: EstimateDetail): EstimateLineItem[] {
  return est.lines.map((l, i) => {
    const parsed = parseFloat(l.itemNo);
    const line_number = Number.isFinite(parsed) && parsed > 0 ? parsed : divNumber(l.division);
    return {
      id: String(i + 1),
      estimate_id: est.id,
      line_number,
      category: l.division || "Other",
      description: l.description,
      quantity: l.qty,
      unit: l.unit || null,
      unit_price: l.unitPrice,
      extended_price: lineTotal(l),
      material_cost: null,
      labor_cost: null,
      retail_price: null,
      notes: l.subName ? `Sub: ${l.subName}` : null,
      product_id: null,
      price_source: null,
      price_date: null,
      created_at: est.date,
    };
  });
}

export function toPdfEstimate(est: EstimateDetail, job: PdfJobInfo | null): Estimate {
  return {
    id: est.id,
    estimate_number: est.source || `EST-${est.id}`,
    estimate_name: est.project,
    client_id: null,
    estimator_id: null,
    reviewer_id: null,
    project_type: est.category,
    estimate_category: "building",
    foundation_type: null,
    foundation_block_height: null,
    square_footage: null,
    project_address: job?.address ?? null,
    status: "draft",
    scope_inclusions: [],
    scope_exclusions: [],
    site_conditions: null,
    materials_subtotal: 0,
    labor_subtotal: 0,
    equipment_subtotal: 0,
    subcontractor_total: 0,
    subcontractor_subtotal: 0,
    retail_total: est.total,
    actual_total: est.total,
    permits_fees: 0,
    overhead_profit: 0,
    overhead_amount: 0,
    profit_amount: 0,
    contingency: 0,
    tax: 0,
    grand_total: est.total,
    cost_per_sqft: null,
    gross_margin_pct: null,
    estimated_start: null,
    estimated_end: null,
    valid_through: null,
    tier: "midrange",
    source: "manual",
    call_id: null,
    validation_results: null,
    validation_passed: true,
    pdf_path: null,
    docx_path: null,
    version: 1,
    parent_estimate_id: null,
    // The cover prints new Date(created_at) — an unparseable date renders "Invalid Date",
    // so an estimate with no parsed date falls back to the day the packet is generated.
    created_at: est.date || new Date().toISOString(),
    updated_at: est.date || new Date().toISOString(),
    sent_at: null,
    accepted_at: null,
    declined_at: null,
  };
}

export function toPdfClient(job: PdfJobInfo | null): Client | null {
  if (!job?.client_name) return null;
  return {
    id: "job",
    full_name: job.client_name,
    email: job.client_email,
    phone: job.client_phone,
    address_line1: job.address,
    address_line2: null,
    city: null,
    state: null,
    zip: null,
    notes: null,
    source: null,
    created_at: "",
    updated_at: "",
  };
}

export function toPdfChangeOrders(rows: PdfChangeOrderRow[]): EstimateChangeOrder[] {
  return rows.map((co, i) => ({
    id: String(co.id),
    estimate_id: "",
    change_number: rows.length - i, // rows arrive newest-first; number oldest = 1
    description: co.description,
    cost_impact: co.amount,
    timeline_impact: null,
    status: co.approved === 1 ? "approved" : co.approved === -1 ? "rejected" : "pending",
    client_signed: false,
    signed_at: co.approved === 1 ? co.approved_date : null,
    created_at: co.created_at,
  }));
}
