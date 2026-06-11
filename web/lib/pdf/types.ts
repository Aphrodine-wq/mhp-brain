// Local copies of the donor app's types — only what the ported PDF components consume.
// Source: mshomepros src/packages/shared/types/database.ts. mhp-brain's own schema maps
// into these shapes via map.ts; the PDF components stay verbatim-portable.

export type EstimateStatus =
  | "draft"
  | "in_review"
  | "revision_requested"
  | "approved"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export type EstimateTier = "budget" | "midrange" | "high_end" | "good" | "better" | "best";
export type EstimateSource = "manual" | "voice" | "template" | "auto" | "photo";
export type EstimateCategory = "building" | "infrastructure";
export type FoundationType = "raised_slab" | "monolithic_slab" | "crawlspace" | "pier_beam";

export interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Estimate {
  id: string;
  estimate_number: string;
  estimate_name: string | null;
  organization_id?: string | null;
  client_id: string | null;
  estimator_id: string | null;
  reviewer_id: string | null;
  project_type: string;
  estimate_category: EstimateCategory;
  foundation_type: FoundationType | null;
  foundation_block_height: number | null;
  square_footage: number | null;
  project_address: string | null;
  status: EstimateStatus;
  scope_inclusions: string[];
  scope_exclusions: string[];
  site_conditions: string | null;
  materials_subtotal: number;
  labor_subtotal: number;
  equipment_subtotal: number;
  subcontractor_total: number;
  subcontractor_subtotal: number;
  retail_total: number;
  actual_total: number;
  permits_fees: number;
  overhead_profit: number;
  overhead_amount: number;
  profit_amount: number;
  contingency: number;
  tax: number;
  grand_total: number;
  cost_per_sqft: number | null;
  gross_margin_pct: number | null;
  estimated_start: string | null;
  estimated_end: string | null;
  valid_through: string | null;
  tier: EstimateTier;
  source: EstimateSource;
  call_id: string | null;
  validation_results: Record<string, unknown> | null;
  validation_passed: boolean;
  pdf_path: string | null;
  docx_path: string | null;
  version: number;
  parent_estimate_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
}

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  line_number: number;
  category: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  extended_price: number | null;
  material_cost: number | null;
  labor_cost: number | null;
  retail_price: number | null;
  notes: string | null;
  product_id: string | null;
  price_source: string | null;
  price_date: string | null;
  created_at: string;
}

export interface EstimateChangeOrder {
  id: string;
  estimate_id: string;
  change_number: number;
  description: string;
  cost_impact: number;
  timeline_impact: string | null;
  status: "draft" | "sent" | "pending" | "approved" | "rejected";
  client_signed: boolean;
  signed_at: string | null;
  created_at: string;
}
