// Assemblies — job-type templates that turn a few real dimensions into a full,
// correctly-quantified scope. The speed unlock: instead of typing a paragraph and
// then hand-fixing 23 quantities, the user picks a job type, enters floor sqft /
// bath count / cabinet feet, and every line's quantity is derived from those inputs.
//
// The per-floor multipliers below are DERIVED FROM MHP JOB HISTORY (median qty per
// floor sqft across 148 estimates, framing-material-sqft as the floor proxy):
//   drywall 3.0x · paint/trim/electrical/insulation 1.0x · LVT 0.95x · tile ~0.12x
//   countertop 0.05x · doors count-based. See scripts derivation in the brain.
//
// Line `desc` strings resolve through canon() against the unit/lump catalog (lib/catalog),
// exactly like parse-job.ts — so they attach proven median rates downstream in buildLines.

export interface AssemblyInputDef {
  key: string;
  label: string;
  placeholder?: string;
  default?: number;
}

export interface AssemblyLineDef {
  desc: string;
  // qty from the input values; return null to leave blank for the estimator to fill
  qty: (i: Record<string, number>) => number | null;
}

export interface Assembly {
  key: string;
  label: string;
  blurb: string;
  inputs: AssemblyInputDef[];
  lines: AssemblyLineDef[];
}

// rounding helper — quantities read cleaner as whole/one-decimal numbers
const r0 = (n: number) => Math.round(n);
const perimeter = (sqft: number) => 4 * Math.sqrt(Math.max(sqft, 0)); // rough footing lft

// ground-up geometry derived from the footprint (matches the worked full-house estimate)
const underRoof = (i: Record<string, number>) => (i.heatedSqft || 0) + (i.garageSqft || 0);
const perimFt = (i: Record<string, number>) => r0(1.1 * perimeter(underRoof(i))); // L-shape factor
const roofSquares = (i: Record<string, number>) => r0((underRoof(i) * 1.3) / 100); // 1.3 pitch factor
const wallArea = (i: Record<string, number>) => r0(perimFt(i) * 10 * 0.85); // 10ft walls less openings
const showers = (i: Record<string, number>) => Math.max(1, r0(i.baths || 0));

const ALWAYS: AssemblyLineDef[] = [
  { desc: "General Conditions", qty: () => 1 },
  { desc: "Project Coordination (Supervision)", qty: () => 1 },
];

export const ASSEMBLIES: Record<string, Assembly> = {
  "bonus-room": {
    key: "bonus-room",
    label: "Bonus Room Suite",
    blurb: "Conditioned room built out over an existing structure, optional bath(s).",
    inputs: [
      { key: "floorSqft", label: "Floor area (sqft)", placeholder: "600", default: 600 },
      { key: "baths", label: "Bathrooms", placeholder: "1", default: 1 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Framing Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Insulation Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Drywall", qty: (i) => r0(i.floorSqft * 3.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.floorSqft * 0.95 - i.baths * 50) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.floorSqft * 0.95 - i.baths * 50) },
      { desc: "Interior Doors", qty: (i) => r0(2 + i.baths) },
      { desc: "Door Hardware", qty: (i) => r0(2 + i.baths) },
      { desc: "Windows ", qty: () => 2 },
      { desc: "HVAC Material", qty: () => 1 },
      // per-bath
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) },
      { desc: "Shower Tile", qty: (i) => r0(i.baths * 60) },
      { desc: "Floor Tile", qty: (i) => r0(i.baths * 50) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.baths * 50) },
      { desc: "Shower Door (Included Material & Labor)", qty: (i) => r0(i.baths) },
    ],
  },

  bathroom: {
    key: "bathroom",
    label: "Bathroom Remodel",
    blurb: "Gut and remodel an existing bathroom.",
    inputs: [
      { key: "sqft", label: "Bathroom area (sqft)", placeholder: "120", default: 120 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Plumbing Material & Labor", qty: () => 3 },
      { desc: "Plumbing Fixtures", qty: () => 1 },
      { desc: "Shower Tile", qty: () => 60 },
      { desc: "Shower Door (Included Material & Labor)", qty: () => 1 },
      { desc: "Floor Tile", qty: (i) => r0(i.sqft) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 2.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Doors", qty: () => 1 },
      { desc: "Door Hardware", qty: () => 1 },
    ],
  },

  kitchen: {
    key: "kitchen",
    label: "Kitchen Remodel",
    blurb: "Gut and remodel a kitchen — cabinets, counters, finishes.",
    inputs: [
      { key: "sqft", label: "Kitchen area (sqft)", placeholder: "300", default: 300 },
      { key: "cabinetLft", label: "Cabinet run (linear ft)", placeholder: "40", default: 40 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Kitchen Cabinets", qty: (i) => r0(i.cabinetLft) },
      { desc: "Cabinet & Drawer Hardware", qty: () => 1 },
      { desc: "Countertop Material", qty: (i) => r0(i.cabinetLft * 2.5) },
      { desc: "Countertop Labor", qty: (i) => r0(i.cabinetLft * 2.5) },
      { desc: "Backsplash Material", qty: () => 30 },
      { desc: "Backsplash Labor", qty: () => 30 },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 1.5) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Plumbing Material & Labor", qty: () => 2 },
    ],
  },

  // New Construction — full ground-up house. Quantities derived from the footprint
  // (perimeter, roof squares, wall area) + bed/bath counts. Validated bottom-up against
  // the Custom Home Tiers $/SF sheets (converges within ~2% at the 25% target markup).
  "new-construction": {
    key: "new-construction",
    label: "New Construction (Full House)",
    blurb: "Ground-up custom home — foundation to finishes. Bottom-up from proven rates.",
    inputs: [
      { key: "heatedSqft", label: "Heated area (sqft)", placeholder: "2400", default: 2400 },
      { key: "garageSqft", label: "Garage (sqft)", placeholder: "440", default: 440 },
      { key: "beds", label: "Bedrooms", placeholder: "3", default: 3 },
      { key: "baths", label: "Bathrooms", placeholder: "2", default: 2 },
    ],
    lines: [
      // general / sitework
      { desc: "General Conditions", qty: () => 1 },
      { desc: "Project Coordination (Supervision)", qty: () => 4 },
      { desc: "Architectural Plans", qty: () => 1 },
      { desc: "Construction Staking", qty: (i) => underRoof(i) },
      { desc: "Termite Pre-Treat", qty: (i) => underRoof(i) },
      // foundation
      { desc: "Footing Material", qty: (i) => perimFt(i) },
      { desc: "Footing Labor", qty: (i) => perimFt(i) },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => underRoof(i) },
      { desc: "Slab Material", qty: (i) => r0((underRoof(i) * 0.333) / 27) + 3 },
      { desc: "Slab Labor", qty: (i) => underRoof(i) },
      // shell
      { desc: "Framing Material", qty: (i) => underRoof(i) },
      { desc: "Framing Labor", qty: (i) => underRoof(i) },
      { desc: "Trusses & Trim Joists", qty: (i) => underRoof(i) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSquares(i) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSquares(i) },
      { desc: "Gutter Material", qty: (i) => r0(perimFt(i) * 0.8) },
      { desc: "Gutter Labor", qty: (i) => r0(perimFt(i) * 0.8) },
      // exterior envelope
      { desc: "Siding Material", qty: (i) => wallArea(i) },
      { desc: "Siding Labor", qty: (i) => wallArea(i) },
      { desc: "Windows ", qty: (i) => r0(i.heatedSqft / 160) },
      { desc: "Exterior Doors", qty: () => 3 },
      { desc: "Exterior Trim Material", qty: (i) => r0(i.heatedSqft * 0.79) },
      { desc: "Exterior Trim Labor", qty: (i) => r0(i.heatedSqft * 0.79) },
      { desc: "Exterior Paint Material", qty: (i) => wallArea(i) },
      { desc: "Exterior Paint Labor", qty: (i) => wallArea(i) },
      // mechanicals
      { desc: "Electrical Material", qty: (i) => underRoof(i) },
      { desc: "Electrical Labor", qty: (i) => underRoof(i) },
      { desc: "Electrical Meter (Permanent Power)", qty: () => 1 },
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3 + 4) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) + 1 },
      { desc: "Plumbing Gas Materials And Labor", qty: () => 2 },
      { desc: "HVAC Material", qty: (i) => Math.max(1, r0(i.heatedSqft / 800)) },
      // interior
      { desc: "Insulation Material", qty: (i) => i.heatedSqft },
      { desc: "Insulation Labor", qty: (i) => i.heatedSqft },
      { desc: "Drywall", qty: (i) => r0(i.heatedSqft * 3.0) },
      { desc: "Interior Paint Material", qty: (i) => i.heatedSqft },
      { desc: "Interior Paint Labor", qty: (i) => i.heatedSqft },
      { desc: "Interior Trim Material", qty: (i) => i.heatedSqft },
      { desc: "Interior Trim Labor", qty: (i) => i.heatedSqft },
      { desc: "Interior Doors", qty: (i) => r0(i.beds + i.baths + 6) },
      { desc: "Door Hardware", qty: (i) => r0(i.beds + i.baths + 6) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.heatedSqft - i.baths * 90 - 180) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.heatedSqft - i.baths * 90 - 180) },
      { desc: "Floor Tile", qty: (i) => r0(i.baths * 90 + 180) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.baths * 90 + 180) },
      { desc: "Shower Tile", qty: (i) => showers(i) * 60 },
      { desc: "Shower Labor", qty: (i) => showers(i) * 60 },
      { desc: "Shower Door (Included Material & Labor)", qty: (i) => showers(i) },
      // cabinetry
      { desc: "Kitchen Cabinets", qty: () => 25 },
      { desc: "Cabinet & Drawer Hardware", qty: () => 1 },
      { desc: "Countertop Material", qty: () => 55 },
      { desc: "Countertop Labor", qty: () => 55 },
      { desc: "Backsplash Material", qty: () => 30 },
      { desc: "Backsplash Labor", qty: () => 30 },
      { desc: "Laundry Cabinets", qty: () => 8 },
    ],
  },

  // Deck/Porch — built on PROVEN porch + framing + footing rates (the catalog has no
  // deck-specific lines; porch sqft work is the like-for-like basis).
  "deck-porch": {
    key: "deck-porch",
    label: "Deck / Porch",
    blurb: "Open deck or porch — framing, decking surface, footings. (Proven porch rates.)",
    inputs: [
      { key: "sqft", label: "Deck/porch area (sqft)", placeholder: "240", default: 240 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Porch Material", qty: (i) => r0(i.sqft) },
      { desc: "Porch Labor", qty: (i) => r0(i.sqft) },
    ],
  },
};

export interface ExpandedAssembly {
  descriptions: string[];
  qtyByCanon: Map<string, number>; // keyed by canon(desc), null/blank omitted
}

/** Expand an assembly against user inputs into scope + per-line quantities. */
export function expandAssembly(key: string, rawInputs: Record<string, number>): ExpandedAssembly | null {
  const a = ASSEMBLIES[key];
  if (!a) return null;
  const inputs: Record<string, number> = {};
  for (const def of a.inputs) {
    const v = rawInputs[def.key];
    inputs[def.key] = Number.isFinite(v) ? v : (def.default ?? 0);
  }
  const descriptions: string[] = [];
  const qtyByCanon = new Map<string, number>();
  const seen = new Set<string>();
  for (const line of a.lines) {
    const c = line.desc.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(c)) continue;
    seen.add(c);
    descriptions.push(line.desc);
    const q = line.qty(inputs);
    if (q != null && Number.isFinite(q) && q > 0) qtyByCanon.set(c, q);
  }
  return { descriptions, qtyByCanon };
}

export const ASSEMBLY_LIST = Object.values(ASSEMBLIES).map((a) => ({
  key: a.key,
  label: a.label,
  blurb: a.blurb,
  inputs: a.inputs,
}));
