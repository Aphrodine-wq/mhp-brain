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
  category: string;
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

// single-input geometry — derive wall area / roofing squares / slab yards from one footprint
const wallFt = (sqft: number) => r0(1.1 * perimeter(sqft) * 10 * 0.85); // wall sqft (L-shape, 10ft walls less openings)
const roofSq = (sqft: number) => r0((sqft * 1.3) / 100);                // roofing squares (1.3 pitch factor)
const slabYards = (sqft: number) => r0((sqft * 0.333) / 27) + 2;        // concrete yds for a 4" slab

const ALWAYS: AssemblyLineDef[] = [
  { desc: "General Conditions", qty: () => 1 },
  { desc: "Project Coordination (Supervision)", qty: () => 1 },
];

export const ASSEMBLIES: Record<string, Assembly> = {
  "bonus-room": {
    key: "bonus-room",
    label: "Bonus Room Suite",
    category: "Additions & Conversions",
    blurb: "Room over an existing structure, optional bath.",
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
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.floorSqft * 0.95 - i.baths * 50)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.floorSqft * 0.95 - i.baths * 50)) },
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
    category: "Remodels & Interiors",
    blurb: "Gut and remodel a bath.",
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
    category: "Remodels & Interiors",
    blurb: "Full gut — cabinets, counters, finishes.",
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
    category: "New Builds",
    blurb: "Ground-up home, foundation to finishes.",
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
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.heatedSqft - i.baths * 90 - 180)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.heatedSqft - i.baths * 90 - 180)) },
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
      // equipment (allowance — no proven history; see lib/catalog ALLOWANCES)
      { desc: "Appliances", qty: () => 1 },
    ],
  },

  // Deck/Porch — built on PROVEN porch + framing + footing rates (the catalog has no
  // deck-specific lines; porch sqft work is the like-for-like basis).
  "deck-porch": {
    key: "deck-porch",
    label: "Deck / Porch",
    category: "Exterior & Outdoor",
    blurb: "Framing, decking, footings.",
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

  // Detached garage — slab-on-grade shell. (No proven garage-door line in the catalog;
  // the estimator adds that one by hand.)
  garage: {
    key: "garage",
    label: "Detached Garage",
    category: "New Builds",
    blurb: "Slab, shell, roof, siding, power.",
    inputs: [
      { key: "sqft", label: "Garage area (sqft)", placeholder: "480", default: 480 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Windows ", qty: () => 2 },
      { desc: "Exterior Doors", qty: () => 1 },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
    ],
  },

  // Ground-level slab addition tied into an existing house. Per-bath lines resolve to 0
  // (and drop out) when baths = 0, so the same template covers a plain bonus room.
  "room-addition": {
    key: "room-addition",
    label: "Room Addition",
    category: "Additions & Conversions",
    blurb: "Slab addition tied into the house.",
    inputs: [
      { key: "floorSqft", label: "Floor area (sqft)", placeholder: "400", default: 400 },
      { key: "baths", label: "Bathrooms", placeholder: "0", default: 0 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.floorSqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.floorSqft)) },
      { desc: "Slab Material", qty: (i) => slabYards(i.floorSqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Framing Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.floorSqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.floorSqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.floorSqft) },
      { desc: "Siding Material", qty: (i) => wallFt(i.floorSqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.floorSqft) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.floorSqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.floorSqft) },
      { desc: "Insulation Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Drywall", qty: (i) => r0(i.floorSqft * 3.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.floorSqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.floorSqft) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.floorSqft * 0.95 - i.baths * 50)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.floorSqft * 0.95 - i.baths * 50)) },
      { desc: "Interior Doors", qty: (i) => r0(1 + i.baths) },
      { desc: "Door Hardware", qty: (i) => r0(1 + i.baths) },
      { desc: "Windows ", qty: () => 2 },
      { desc: "HVAC Material", qty: () => 1 },
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) },
      { desc: "Shower Tile", qty: (i) => r0(i.baths * 60) },
      { desc: "Floor Tile", qty: (i) => r0(i.baths * 50) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.baths * 50) },
      { desc: "Shower Door (Included Material & Labor)", qty: (i) => r0(i.baths) },
    ],
  },

  // Tear-off and re-roof. Squares from the footprint, gutters from the perimeter.
  reroof: {
    key: "reroof",
    label: "Roof Replacement",
    category: "Exterior & Outdoor",
    blurb: "Tear-off, shingles, and gutters.",
    inputs: [
      { key: "sqft", label: "Roof footprint (sqft)", placeholder: "2000", default: 2000 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Gutter Material", qty: (i) => r0(perimeter(i.sqft) * 0.8) },
      { desc: "Gutter Labor", qty: (i) => r0(perimeter(i.sqft) * 0.8) },
    ],
  },

  // Re-side the exterior — siding, exterior trim, repaint.
  siding: {
    key: "siding",
    label: "Siding Replacement",
    category: "Exterior & Outdoor",
    blurb: "New siding, trim, and repaint.",
    inputs: [
      { key: "sqft", label: "Heated area (sqft)", placeholder: "2000", default: 2000 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Trim Material", qty: (i) => r0(i.sqft * 0.79) },
      { desc: "Exterior Trim Labor", qty: (i) => r0(i.sqft * 0.79) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.sqft) },
    ],
  },

  // Cosmetic interior refresh — repaint, new floors, trim. Light drywall for patching.
  "interior-refresh": {
    key: "interior-refresh",
    label: "Interior Refresh",
    category: "Remodels & Interiors",
    blurb: "Paint, flooring, trim — no structural.",
    inputs: [
      { key: "sqft", label: "Floor area (sqft)", placeholder: "1500", default: 1500 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 0.3) },
    ],
  },

  // Pull-and-replace flooring — LVT throughout, optional tile areas carved out.
  flooring: {
    key: "flooring",
    label: "Flooring Replacement",
    category: "Remodels & Interiors",
    blurb: "LVT throughout, optional tile.",
    inputs: [
      { key: "sqft", label: "Total floor area (sqft)", placeholder: "1200", default: 1200 },
      { key: "tileSqft", label: "Tile area (sqft)", placeholder: "0", default: 0 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft - i.tileSqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft - i.tileSqft) },
      { desc: "Floor Tile", qty: (i) => r0(i.tileSqft) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.tileSqft) },
    ],
  },

  // Garage -> conditioned living space. Light framing (furring/partitions), full envelope
  // and finish package; window + door cut-ins by hand if the plan calls for them.
  "garage-conversion": {
    key: "garage-conversion",
    label: "Garage Conversion",
    category: "Additions & Conversions",
    blurb: "Garage to living space — envelope and finishes.",
    inputs: [
      { key: "sqft", label: "Garage area (sqft)", placeholder: "440", default: 440 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Framing Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 2.5) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "HVAC Material", qty: () => 1 },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Doors", qty: () => 1 },
      { desc: "Door Hardware", qty: () => 1 },
      { desc: "Windows", qty: () => 1 },
    ],
  },

  // Covered porch — open Deck/Porch plus posts and a shingle roof over it.
  "covered-porch": {
    key: "covered-porch",
    label: "Covered Porch",
    category: "Exterior & Outdoor",
    blurb: "Porch with posts and a shingle roof.",
    inputs: [
      { key: "sqft", label: "Porch area (sqft)", placeholder: "240", default: 240 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Porch Material", qty: (i) => r0(i.sqft) },
      { desc: "Porch Labor", qty: (i) => r0(i.sqft) },
      // posts every ~8ft of perimeter, 10ft tall
      { desc: "Wood Post & Column Material", qty: (i) => r0((perimeter(i.sqft) / 8) * 10) },
      { desc: "Wood Post & Column Labor", qty: (i) => r0((perimeter(i.sqft) / 8) * 10) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Exterior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => r0(i.sqft) },
    ],
  },

  // Flatwork — slab, driveway, or patio off proven concrete rates.
  "concrete-slab": {
    key: "concrete-slab",
    label: "Concrete Slab / Driveway",
    category: "Exterior & Outdoor",
    blurb: "Forming, pour, and finish off proven rates.",
    inputs: [
      { key: "sqft", label: "Slab area (sqft)", placeholder: "600", default: 600 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Site Prep/Grading", qty: () => 1 },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => r0(i.sqft) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
    ],
  },

  // Repaint inside and out — wall area derived from the footprint for the exterior side.
  repaint: {
    key: "repaint",
    label: "Whole-House Repaint",
    category: "Remodels & Interiors",
    blurb: "Interior and exterior, two coats.",
    inputs: [
      { key: "sqft", label: "Heated area (sqft)", placeholder: "1800", default: 1800 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.sqft) },
    ],
  },

  // Pull-and-set window replacement; trim and touch-up scale per opening.
  windows: {
    key: "windows",
    label: "Window Replacement",
    category: "Exterior & Outdoor",
    blurb: "Per-opening replacement with trim and touch-up.",
    inputs: [
      { key: "count", label: "Window openings", placeholder: "10", default: 10 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Windows", qty: (i) => r0(i.count) },
      { desc: "Exterior Trim Material", qty: (i) => r0(i.count * 15) },
      { desc: "Exterior Trim Labor", qty: (i) => r0(i.count * 15) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.count * 10) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.count * 10) },
      { desc: "Exterior Paint Material", qty: (i) => r0(i.count * 15) },
      { desc: "Exterior Paint Labor", qty: (i) => r0(i.count * 15) },
    ],
  },

  // Counter swap — tops, backsplash, and the sink re-set.
  countertops: {
    key: "countertops",
    label: "Countertops & Backsplash",
    category: "Remodels & Interiors",
    blurb: "New tops, backsplash, sink re-set.",
    inputs: [
      { key: "sqft", label: "Counter area (sqft)", placeholder: "55", default: 55 },
      { key: "bsSqft", label: "Backsplash area (sqft)", placeholder: "30", default: 30 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Countertop Material", qty: (i) => r0(i.sqft) },
      { desc: "Countertop Labor", qty: (i) => r0(i.sqft) },
      { desc: "Backsplash Material", qty: (i) => r0(i.bsSqft) },
      { desc: "Backsplash Labor", qty: (i) => r0(i.bsSqft) },
      { desc: "Plumbing Material & Labor", qty: () => 1 },
    ],
  },

  // Attic -> finished space over the existing footprint; stairs are the defining line.
  "attic-conversion": {
    key: "attic-conversion",
    label: "Attic Conversion",
    blurb: "Finish the attic — stairs, envelope, finishes.",
    category: "Additions & Conversions",
    inputs: [
      { key: "sqft", label: "Finished area (sqft)", placeholder: "400", default: 400 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Stair Material", qty: () => 1 },
      { desc: "Stair Labor", qty: () => 1 },
      { desc: "Framing Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 2.5) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "HVAC Material", qty: () => 1 },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
      { desc: "Windows", qty: () => 2 },
    ],
  },

  // Patio slab + covered roof + gas for the grill — the outdoor-living package.
  "outdoor-living": {
    key: "outdoor-living",
    label: "Outdoor Living / Patio",
    blurb: "Covered patio with power and gas.",
    category: "Exterior & Outdoor",
    inputs: [
      { key: "sqft", label: "Patio area (sqft)", placeholder: "300", default: 300 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Site Prep/Grading", qty: () => 1 },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => r0(i.sqft) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Wood Post & Column Material", qty: (i) => r0((perimeter(i.sqft) / 8) * 10) },
      { desc: "Wood Post & Column Labor", qty: (i) => r0((perimeter(i.sqft) / 8) * 10) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Plumbing Gas Materials And Labor", qty: () => 1 },
      { desc: "Exterior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => r0(i.sqft) },
    ],
  },

  // ── Commercial — same proven rates, commercial shapes (MHP's clinic/bank/storage work) ──

  // Tenant finish-out: partitions, full MEP touch, finishes. Per leased sqft.
  "tenant-buildout": {
    key: "tenant-buildout",
    label: "Tenant Buildout / Clinic Finish",
    blurb: "Partitions, MEP, finishes for a leased shell.",
    category: "Commercial",
    inputs: [
      { key: "sqft", label: "Leased area (sqft)", placeholder: "2000", default: 2000 },
      { key: "baths", label: "Restrooms", placeholder: "2", default: 2 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Building Permits", qty: () => 1 },
      { desc: "Framing Material", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 2.2) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "HVAC Material", qty: (i) => Math.max(1, r0(i.sqft / 1200)) },
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) },
      { desc: "Interior Doors", qty: (i) => Math.max(2, r0(i.sqft / 250)) },
      { desc: "Door Hardware", qty: (i) => Math.max(2, r0(i.sqft / 250)) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft * 0.6) },
    ],
  },

  // Office/clinic refresh — finishes only, occupied-space work.
  "office-renovation": {
    key: "office-renovation",
    label: "Office Renovation",
    blurb: "Paint, flooring, doors — occupied space.",
    category: "Commercial",
    inputs: [
      { key: "sqft", label: "Office area (sqft)", placeholder: "1500", default: 1500 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 0.3) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Interior Doors", qty: (i) => Math.max(1, r0(i.sqft / 400)) },
      { desc: "Door Hardware", qty: (i) => Math.max(1, r0(i.sqft / 400)) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft * 0.4) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft * 0.4) },
    ],
  },

  // Commercial re-roof — same proven roofing rates at commercial scale.
  "commercial-reroof": {
    key: "commercial-reroof",
    label: "Commercial Re-roof",
    blurb: "Tear-off and re-roof at commercial scale.",
    category: "Commercial",
    inputs: [
      { key: "sqft", label: "Roof footprint (sqft)", placeholder: "6000", default: 6000 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Building Permits", qty: () => 1 },
      { desc: "Waste Management", qty: (i) => Math.max(1, r0(i.sqft / 3000)) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Gutter Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Gutter Labor", qty: (i) => r0(perimeter(i.sqft)) },
    ],
  },

  // Slab-on-grade shop/storage shell — MHP's storage/commercial pattern.
  "shop-storage": {
    key: "shop-storage",
    label: "Shop / Storage Building",
    blurb: "Slab-on-grade shell with power.",
    category: "Commercial",
    inputs: [
      { key: "sqft", label: "Building area (sqft)", placeholder: "1500", default: 1500 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Building Permits", qty: () => 1 },
      { desc: "Site Prep/Grading", qty: () => 1 },
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => r0(i.sqft) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Doors", qty: () => 2 },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft * 0.6) },
      { desc: "Electrical Meter (Permanent Power)", qty: () => 1 },
    ],
  },

  // ── Future-facing templates — assembled entirely from catalog-proven lines, so
  // every quantity attaches a real median rate (no blank "missing" lines). ──

  // Detached ADU / guest house — a full small home: foundation through finishes,
  // including a compact kitchen and bath. Quantities off the footprint + bath count.
  "guest-house": {
    key: "guest-house",
    label: "Guest House / ADU",
    category: "New Builds",
    blurb: "Detached small home — foundation to finishes.",
    inputs: [
      { key: "sqft", label: "Floor area (sqft)", placeholder: "600", default: 600 },
      { key: "baths", label: "Bathrooms", placeholder: "1", default: 1 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => r0(i.sqft) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Gutter Material", qty: (i) => r0(perimeter(i.sqft) * 0.8) },
      { desc: "Gutter Labor", qty: (i) => r0(perimeter(i.sqft) * 0.8) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Windows", qty: (i) => Math.max(2, r0(i.sqft / 120)) },
      { desc: "Exterior Doors", qty: () => 2 },
      { desc: "Exterior Trim Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Exterior Trim Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Meter (Permanent Power)", qty: () => 1 },
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3 + 2) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) + 1 },
      { desc: "HVAC Material", qty: () => 1 },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 3.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Doors", qty: (i) => r0(2 + i.baths) },
      { desc: "Door Hardware", qty: (i) => r0(2 + i.baths) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.sqft - i.baths * 50)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.sqft - i.baths * 50)) },
      { desc: "Floor Tile", qty: (i) => r0(i.baths * 50) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.baths * 50) },
      { desc: "Shower Tile", qty: (i) => r0(i.baths * 60) },
      { desc: "Shower Door (Included Material & Labor)", qty: (i) => r0(i.baths) },
      { desc: "Kitchen Cabinets", qty: () => 12 },
      { desc: "Cabinet & Drawer Hardware", qty: () => 1 },
      { desc: "Countertop Material", qty: () => 20 },
      { desc: "Countertop Labor", qty: () => 20 },
      { desc: "Appliances", qty: () => 1 },
    ],
  },

  // Master suite addition — bedroom + ensuite bath + walk-in, slab-on-grade tied
  // into the house. The premium add-on MHP gets asked for most.
  "master-suite": {
    key: "master-suite",
    label: "Master Suite Addition",
    category: "Additions & Conversions",
    blurb: "Bedroom, ensuite bath, and walk-in closet.",
    inputs: [
      { key: "sqft", label: "Suite area (sqft)", placeholder: "400", default: 400 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Windows", qty: (i) => Math.max(2, r0(i.sqft / 130)) },
      { desc: "Exterior Trim Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Exterior Trim Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 3.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "HVAC Material", qty: () => 1 },
      { desc: "Plumbing Material & Labor", qty: () => 3 },
      { desc: "Plumbing Fixtures", qty: () => 1 },
      { desc: "Shower Tile", qty: () => 60 },
      { desc: "Shower Door (Included Material & Labor)", qty: () => 1 },
      { desc: "Floor Tile", qty: () => 90 },
      { desc: "Floor Tile Labor", qty: () => 90 },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.sqft - 90)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.sqft - 90)) },
      { desc: "Interior Doors", qty: () => 3 },
      { desc: "Door Hardware", qty: () => 3 },
    ],
  },

  // Sunroom / three-season room — glass-heavy framed room on a slab. Lots of
  // windows, light envelope, finished floor.
  sunroom: {
    key: "sunroom",
    label: "Sunroom / Three-Season Room",
    category: "Additions & Conversions",
    blurb: "Glass-heavy room on a slab, finished floor.",
    inputs: [
      { key: "sqft", label: "Room area (sqft)", placeholder: "200", default: 200 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Windows", qty: (i) => Math.max(4, r0(i.sqft / 25)) },
      { desc: "Exterior Doors", qty: () => 1 },
      { desc: "Siding Material", qty: (i) => r0(wallFt(i.sqft) * 0.3) },
      { desc: "Siding Labor", qty: (i) => r0(wallFt(i.sqft) * 0.3) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(i.sqft) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(i.sqft) },
    ],
  },

  // Carport — open slab + posts + roof. No walls or finishes.
  carport: {
    key: "carport",
    label: "Carport",
    category: "Exterior & Outdoor",
    blurb: "Open slab, posts, and a roof.",
    inputs: [
      { key: "sqft", label: "Carport area (sqft)", placeholder: "400", default: 400 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Wood Post & Column Material", qty: (i) => r0((perimeter(i.sqft) / 8) * 10) },
      { desc: "Wood Post & Column Labor", qty: (i) => r0((perimeter(i.sqft) / 8) * 10) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
    ],
  },

  // Mudroom / laundry room buildout — cabinetry, plumbing, durable tile floor.
  "mudroom-laundry": {
    key: "mudroom-laundry",
    label: "Mudroom / Laundry Room",
    category: "Remodels & Interiors",
    blurb: "Cabinets, plumbing, tile floor, trim.",
    inputs: [
      { key: "sqft", label: "Room area (sqft)", placeholder: "120", default: 120 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Laundry Cabinets", qty: () => 8 },
      { desc: "Plumbing Material & Labor", qty: () => 1 },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Floor Tile", qty: (i) => r0(i.sqft) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 2.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Doors", qty: () => 1 },
      { desc: "Door Hardware", qty: () => 1 },
    ],
  },

  // Whole-home gut renovation — strip to studs and rebuild every system + finish.
  // The big-ticket interior job; kitchen + baths included.
  "whole-home-renovation": {
    key: "whole-home-renovation",
    label: "Whole-Home Renovation (Gut)",
    category: "Remodels & Interiors",
    blurb: "Strip to studs — all systems and finishes rebuilt.",
    inputs: [
      { key: "sqft", label: "Heated area (sqft)", placeholder: "1800", default: 1800 },
      { key: "baths", label: "Bathrooms", placeholder: "2", default: 2 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3 + 4) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) + 1 },
      { desc: "HVAC Material", qty: (i) => Math.max(1, r0(i.sqft / 800)) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 1.5) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Doors", qty: (i) => Math.max(2, r0(i.sqft / 200)) },
      { desc: "Door Hardware", qty: (i) => Math.max(2, r0(i.sqft / 200)) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.sqft - i.baths * 90)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.sqft - i.baths * 90)) },
      { desc: "Floor Tile", qty: (i) => r0(i.baths * 90) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.baths * 90) },
      { desc: "Shower Tile", qty: (i) => showers(i) * 60 },
      { desc: "Shower Door (Included Material & Labor)", qty: (i) => showers(i) },
      { desc: "Kitchen Cabinets", qty: () => 25 },
      { desc: "Cabinet & Drawer Hardware", qty: () => 1 },
      { desc: "Countertop Material", qty: () => 55 },
      { desc: "Countertop Labor", qty: () => 55 },
      { desc: "Backsplash Material", qty: () => 30 },
      { desc: "Backsplash Labor", qty: () => 30 },
      { desc: "Appliances", qty: () => 1 },
    ],
  },

  // Exterior renovation — re-roof, re-side, gutters, trim, and repaint in one pass.
  "exterior-renovation": {
    key: "exterior-renovation",
    label: "Exterior Renovation (Roof + Siding)",
    category: "Exterior & Outdoor",
    blurb: "Re-roof, re-side, gutters, trim, repaint.",
    inputs: [
      { key: "sqft", label: "Heated area (sqft)", placeholder: "2000", default: 2000 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Gutter Material", qty: (i) => r0(perimeter(i.sqft) * 0.8) },
      { desc: "Gutter Labor", qty: (i) => r0(perimeter(i.sqft) * 0.8) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Trim Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Exterior Trim Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Exterior Paint Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Paint Labor", qty: (i) => wallFt(i.sqft) },
    ],
  },

  // Barndominium — post-frame metal building finished out as a home. MHP's signature
  // build (the estimate packet is literally branded for it). Shell + full interior.
  barndominium: {
    key: "barndominium",
    label: "Barndominium (Metal Building Home)",
    category: "New Builds",
    blurb: "Post-frame metal shell finished as a home.",
    inputs: [
      { key: "sqft", label: "Heated area (sqft)", placeholder: "1600", default: 1600 },
      { key: "baths", label: "Bathrooms", placeholder: "2", default: 2 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Building Permits", qty: () => 1 },
      { desc: "Site Prep/Grading", qty: () => 1 },
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => r0(i.sqft) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Windows", qty: (i) => Math.max(2, r0(i.sqft / 160)) },
      { desc: "Exterior Doors", qty: () => 3 },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Meter (Permanent Power)", qty: () => 1 },
      { desc: "Plumbing Material & Labor", qty: (i) => r0(i.baths * 3 + 4) },
      { desc: "Plumbing Fixtures", qty: (i) => r0(i.baths) + 1 },
      { desc: "HVAC Material", qty: (i) => Math.max(1, r0(i.sqft / 800)) },
      { desc: "Insulation Material", qty: (i) => r0(i.sqft) },
      { desc: "Insulation Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 3.0) },
      { desc: "Interior Paint Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Paint Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Material", qty: (i) => r0(i.sqft) },
      { desc: "Interior Trim Labor", qty: (i) => r0(i.sqft) },
      { desc: "Interior Doors", qty: (i) => r0(i.baths + 5) },
      { desc: "Door Hardware", qty: (i) => r0(i.baths + 5) },
      { desc: "LVT Flooring - Materials", qty: (i) => r0(Math.max(0, i.sqft - i.baths * 90)) },
      { desc: "LVT Flooring - Labor", qty: (i) => r0(Math.max(0, i.sqft - i.baths * 90)) },
      { desc: "Floor Tile", qty: (i) => r0(i.baths * 90) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.baths * 90) },
      { desc: "Shower Tile", qty: (i) => showers(i) * 60 },
      { desc: "Shower Door (Included Material & Labor)", qty: (i) => showers(i) },
      { desc: "Kitchen Cabinets", qty: () => 20 },
      { desc: "Cabinet & Drawer Hardware", qty: () => 1 },
      { desc: "Countertop Material", qty: () => 45 },
      { desc: "Countertop Labor", qty: () => 45 },
      { desc: "Appliances", qty: () => 1 },
    ],
  },

  // Net-new full bathroom where none existed — frame the room, run new supply/DWV,
  // set fixtures, tile, and finish. Distinct from `bathroom` (which gut-remodels an
  // existing bath). Drywall runs high per floor sqft — small room, lots of wall.
  "bathroom-addition": {
    key: "bathroom-addition",
    label: "Bathroom Addition (Net-New)",
    category: "Additions & Conversions",
    blurb: "A full bath where none existed — framing, plumbing, tile.",
    inputs: [
      { key: "sqft", label: "Bathroom area (sqft)", placeholder: "60", default: 60 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Plumbing Material & Labor", qty: () => 3 },
      { desc: "Plumbing Fixtures", qty: () => 1 },
      { desc: "Shower Tile", qty: () => 60 },
      { desc: "Shower Door (Included Material & Labor)", qty: () => 1 },
      { desc: "Floor Tile", qty: (i) => r0(i.sqft) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 4.0) },
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

  // Attached garage tied into the house — footings, slab, shell, roof, power. Shares
  // a wall with the house, so siding runs the three exposed walls. (No garage-door
  // line in the catalog — the estimator adds the door by hand, same as Detached Garage.)
  "garage-addition": {
    key: "garage-addition",
    label: "Attached Garage Addition",
    category: "Additions & Conversions",
    blurb: "Garage tied into the house — slab, shell, roof, power.",
    inputs: [
      { key: "sqft", label: "Garage area (sqft)", placeholder: "440", default: 440 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Gutter Material", qty: (i) => r0(perimeter(i.sqft) * 0.6) },
      { desc: "Gutter Labor", qty: (i) => r0(perimeter(i.sqft) * 0.6) },
      { desc: "Siding Material", qty: (i) => r0(wallFt(i.sqft) * 0.75) },
      { desc: "Siding Labor", qty: (i) => r0(wallFt(i.sqft) * 0.75) },
      { desc: "Exterior Doors", qty: () => 1 },
      { desc: "Exterior Paint Material", qty: (i) => r0(wallFt(i.sqft) * 0.75) },
      { desc: "Exterior Paint Labor", qty: (i) => r0(wallFt(i.sqft) * 0.75) },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft) },
    ],
  },

  // Residential pole barn / metal shop — post-frame shell only, no interior finish.
  // The barndominium minus drywall/insulation/finishes; for a personal shop or barn.
  // (Metal roof/siding price off the proven shingle/siding rates as the like-for-like basis.)
  "pole-barn": {
    key: "pole-barn",
    label: "Pole Barn / Metal Shop (Shell)",
    category: "New Builds",
    blurb: "Post-frame metal shell — slab, posts, roof, basic power.",
    inputs: [
      { key: "sqft", label: "Building area (sqft)", placeholder: "1200", default: 1200 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Building Permits", qty: () => 1 },
      { desc: "Site Prep/Grading", qty: () => 1 },
      { desc: "Footing Material", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Footing Labor", qty: (i) => r0(perimeter(i.sqft)) },
      { desc: "Concrete Forming Material (Includes Reinforcement)", qty: (i) => r0(i.sqft) },
      { desc: "Slab Material", qty: (i) => slabYards(i.sqft) },
      { desc: "Slab Labor", qty: (i) => r0(i.sqft) },
      { desc: "Wood Post & Column Material", qty: (i) => r0((perimeter(i.sqft) / 8) * 12) },
      { desc: "Wood Post & Column Labor", qty: (i) => r0((perimeter(i.sqft) / 8) * 12) },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Trusses & Trim Joists", qty: (i) => r0(i.sqft) },
      { desc: "Shingle Roofing Material", qty: (i) => roofSq(i.sqft) },
      { desc: "Shingle Roofing Labor", qty: (i) => roofSq(i.sqft) },
      { desc: "Siding Material", qty: (i) => wallFt(i.sqft) },
      { desc: "Siding Labor", qty: (i) => wallFt(i.sqft) },
      { desc: "Exterior Doors", qty: () => 2 },
      { desc: "Windows", qty: () => 2 },
      { desc: "Electrical Material", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Electrical Labor", qty: (i) => r0(i.sqft * 0.5) },
      { desc: "Electrical Meter (Permanent Power)", qty: () => 1 },
    ],
  },

  // Half bath / powder room — small net-new toilet + lav carved into existing space.
  // No tub/shower, so plumbing and fixtures are lighter than a full bath.
  "half-bath": {
    key: "half-bath",
    label: "Half Bath / Powder Room",
    category: "Remodels & Interiors",
    blurb: "Net-new powder room — toilet, lav, floor, door.",
    inputs: [
      { key: "sqft", label: "Powder room area (sqft)", placeholder: "25", default: 25 },
    ],
    lines: [
      ...ALWAYS,
      { desc: "Structure Demolition", qty: () => 1 },
      { desc: "Framing Material", qty: (i) => r0(i.sqft) },
      { desc: "Framing Labor", qty: (i) => r0(i.sqft) },
      { desc: "Plumbing Material & Labor", qty: () => 2 },
      { desc: "Plumbing Fixtures", qty: () => 1 },
      { desc: "Floor Tile", qty: (i) => r0(i.sqft) },
      { desc: "Floor Tile Labor", qty: (i) => r0(i.sqft) },
      { desc: "Drywall", qty: (i) => r0(i.sqft * 4.0) },
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

export const ASSEMBLY_CATEGORIES = [
  "New Builds",
  "Commercial",
  "Remodels & Interiors",
  "Additions & Conversions",
  "Exterior & Outdoor",
];

export const ASSEMBLY_LIST = Object.values(ASSEMBLIES).map((a) => ({
  key: a.key,
  label: a.label,
  blurb: a.blurb,
  category: a.category,
  inputs: a.inputs,
}));
