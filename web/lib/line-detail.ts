// Detail at every level of the estimate so it reads like a defensible, proposal-grade bid:
//   LINE_DETAIL     — per line item: materials spec, labor scope, what's included / excluded
//   DIVISION_DETAIL — per CSI division: what that phase of the build covers
//   ESTIMATE_SCOPE  — document level: standard inclusions, exclusions, assumptions, terms
// Keyed by canon(text) (lowercase, whitespace-collapsed) to match the catalog + division labels.

export const LINE_DETAIL: Record<string, string> = {
  // ── general / sitework ──
  "general conditions":
    "Mobilization and the fixed cost of running the job: builder's risk insurance, temporary power and water, dumpsters and debris haul-off, port-a-john, weekly progress cleaning, and final make-ready clean. Includes permits coordination. Excludes impact/utility tap fees and HOA deposits.",
  "project coordination (supervision)":
    "Active superintendence per period: scheduling and sequencing every sub, ordering and staging materials to the schedule, daily site walks, inspection coordination and hold points, and quality control to plan. Excludes design changes and owner-directed rework.",
  "architectural plans":
    "Permit-ready construction drawings and structural engineering: dimensioned floor plans, elevations, sections, foundation and framing details, and energy compliance. Excludes boundary/topographic survey, civil/site engineering, and HERS rating unless added.",
  "construction staking":
    "Layout of building corners, setbacks, and foundation lines from the plot plan; batter boards, offsets, and grade references set for the foundation crew. Assumes a cleared, rough-graded pad. Excludes boundary survey and tree removal.",
  "termite pre-treat":
    "EPA-registered soil termiticide barrier applied under and around the slab footprint before pour, with the bonded treatment certificate required for inspection and the renewable warranty. Excludes annual renewal after year one.",

  // ── foundation / concrete ──
  "footing material":
    "3,000+ PSI concrete, #4 rebar, dowels, and form stakes for continuous perimeter and interior bearing footings sized to the foundation plan and soil bearing. Priced per linear foot of footing run. Excludes over-excavation/engineered fill for poor soils.",
  "footing labor":
    "Excavate to bearing depth, form, set and tie rebar, place and consolidate concrete, and hold for the footing inspection before backfill. Includes step-downs and pier pads per plan.",
  "concrete forming material (includes reinforcement)":
    "Slab edge forming, 6-mil vapor barrier, #3 rebar / 6x6 welded wire mesh, chairs, and expansion material, sized to the under-roof footprint. Includes thickened edges at bearing lines.",
  "slab material":
    "Ready-mix concrete for the slab, thickened edges, and turn-downs at the spec'd PSI mix, priced per cubic yard delivered. Includes pump if access requires; excludes winter heat/blankets on cold pours.",
  "slab labor":
    "Set forms and screeds, place vapor barrier, mesh and rebar, coordinate under-slab plumbing/electrical stub-outs, then pour, screed, float, trowel, and cure to a finished slab ready to frame.",

  // ── shell / framing / roof ──
  "framing material":
    "Kiln-dried #2 SPF dimensional lumber, engineered headers/beams, OSB wall and roof sheathing, hurricane clips and connectors, and fasteners for walls, floor system, and roof per plan — exterior load-bearing and interior partitions. Priced per under-roof sqft. Excludes engineered floor trusses (separate line).",
  "framing labor":
    "Frame and stand exterior and interior walls, set the floor/roof structure, sheathe, install connectors, and dry-in rough openings square, plumb, and to plan — ready for the roof and mechanicals. Includes blocking for cabinets, fixtures, and grab bars.",
  "trusses & trim joists":
    "Engineered roof trusses and/or I-joist floor system with stamped layout, delivered and set with temporary and permanent bracing, hangers, and clips per the truss engineering. Includes crane set if required.",
  "shingle roofing material":
    "30-year architectural (dimensional) shingles, synthetic underlayment, ice-and-water shield at valleys and eaves, drip edge, ridge vent, pipe boots, and step/counter flashing. Priced per roofing square (100 sqft). Excludes structural decking repair.",
  "shingle roofing labor":
    "Dry-in, flash all penetrations, valleys, and wall intersections, and install shingles and ridge cap to manufacturer spec so the system warranty holds. Includes haul-off of tear-off if any.",
  "gutter material":
    "5\"/6\" seamless aluminum K-style gutter, downspouts, hidden hangers, end caps, and outlets sized to the roof drainage area. Priced per linear foot. Excludes underground drain tie-in.",
  "gutter labor":
    "Fabricate seamless runs on site, hang to drainage pitch, and route downspouts to splash blocks or the drainage plan.",

  // ── exterior envelope ──
  "siding material":
    "Fiber-cement (James Hardie) lap or panel, house wrap / weather-resistive barrier, flashing tape, trim, and corrosion-rated fasteners. Priced per sqft of wall area less openings. Excludes brick/stone veneer (separate scope).",
  "siding labor":
    "Install and seam the WRB, flash all openings and penetrations, then layout, gap, and fasten siding to manufacturer spec with proper laps and ground/roof clearances. Includes caulking joints for paint.",
  windows:
    "Supply and set energy-code vinyl, low-E insulated, double-hung/casement units per the window schedule, shimmed, flashed, and sealed to the WRB. Priced per opening. Excludes interior trim/casing (interior trim line) and specialty/custom shapes.",
  "exterior doors":
    "Insulated exterior door units (front entry, rear, garage-to-house) with thresholds, weatherstrip, sill pans, and bored lockset prep, set, shimmed, and flashed. Priced per opening. Excludes finish hardware upgrades and storm doors.",
  "exterior trim material":
    "Fascia, frieze, corner boards, soffit, and exterior door/window casing in primed composite or cement board. Priced per sqft of conditioned area as a trim-run proxy.",
  "exterior trim labor":
    "Cut and install fascia, soffit, corner boards, and exterior casing; caulk all joints and prep for paint.",
  "exterior paint material":
    "Exterior acrylic primer where needed and two finish coats, plus paintable caulk, for siding, trim, and soffit. Priced per exterior unit. Excludes solid-stain and specialty coatings.",
  "exterior paint labor":
    "Wash/prep, mask and protect, prime bare areas, caulk, and apply two coats to siding and trim to a uniform finish.",

  // ── mechanicals ──
  "electrical material":
    "Copper branch wiring, boxes, 200A panel and breakers, devices, smoke/CO detectors, recessed and surface fixtures rough stock, and exterior receptacles per the electrical plan and NEC. Priced per under-roof sqft. Excludes decorative fixture allowance and low-voltage/AV.",
  "electrical labor":
    "Rough-in all circuits, set the panel and grounding, then trim out devices, fixtures, and covers; coordinate the rough and final inspections. Includes GFCI/AFCI protection per code.",
  "electrical meter (permanent power)":
    "Meter base, service entrance conductors, mast/riser, grounding electrode system, and utility coordination to set the meter and energize the home. Excludes utility company impact/connection fees.",
  "plumbing material & labor":
    "Supply (PEX/copper), DWV, and gas rough-in plus fixture set per opening — each sink, toilet, tub/shower, water heater, washer box, and hose bib — tested and inspected. Priced per plumbing opening. Fixtures themselves are a separate allowance line.",
  "plumbing fixtures":
    "Fixture allowance: toilets, lavatory and kitchen faucets, tub/shower valves and trim, and the water heater (tank or tankless). Quality-dependent — confirm against the selection sheet. Excludes designer/luxury fixture upgrades.",
  "plumbing gas materials and labor":
    "Black iron / CSST gas piping, regulator, and connections for tankless water heater, range, and/or furnace, pressure-tested and inspected. Excludes propane tank set and utility gas tap.",
  "hvac material":
    "Right-sized condenser, air handler/furnace, supply and return ductwork, registers, refrigerant, line set, and programmable thermostat per a Manual J/D load calc. Priced per system; ~1 system per ~800 heated sqft. Excludes zoning and ERV/HRV upgrades.",

  // ── interior ──
  "insulation material":
    "Wall batt or blown insulation and blown attic insulation to code R-values, plus caulk, foam, and gaskets for air-sealing the envelope. Priced per heated sqft. Excludes spray foam and sound batts unless specified.",
  "insulation labor":
    "Air-seal top/bottom plates and penetrations, install wall insulation and attic blown-in to the spec'd R-value, and pass the insulation inspection.",
  drywall:
    "1/2\" board (5/8\" at garage/ceilings), corner bead, tape, and joint compound hung and finished to a Level 4 finish on walls and ceilings, ready for primer. Priced per sqft of board (~3× floor area for walls + ceiling). Includes garage firewall; excludes Level 5 / specialty texture.",
  "interior paint material":
    "Drywall primer/sealer, two coats wall paint, and trim/door enamel, plus caulk and patch compound. Priced per interior unit. Excludes accent walls, wallpaper, and faux finishes.",
  "interior paint labor":
    "Mask and protect, prime, caulk, and apply two coats to walls and ceilings plus enamel to trim and doors, with punch-out touch-up.",
  "interior trim material":
    "Baseboard, door casing, pre-hung jambs, window stool/apron, shoe mould, and fasteners in primed MDF/wood. Priced per heated sqft. Excludes crown, coffered ceilings, and built-ins.",
  "interior trim labor":
    "Hang interior doors, case openings, run base and window trim, and install millwork to a finish-carpentry standard; caulk and fill for paint.",
  "interior doors":
    "Pre-hung hollow/solid-core interior door units per the door schedule, set plumb and shimmed. Priced per opening; casing carried in interior trim. Excludes barn/pocket door hardware.",
  "door hardware":
    "Passage, privacy, and dummy sets plus hinges and door stops per opening, installed and adjusted. Excludes smart locks and designer hardware.",
  "lvt flooring - materials":
    "Luxury vinyl plank (rigid-core), underlayment, and transition/reducer strips for living areas, halls, and bedrooms. Priced per sqft of installed area (less tiled wet areas). Excludes subfloor replacement.",
  "lvt flooring - labor":
    "Clean, prep, and level the substrate within tolerance, dry-lay layout, then install LVP with transitions, thresholds, and quarter-round.",
  "floor tile":
    "Porcelain/ceramic floor tile, thinset, grout, backer board, and waterproofing for baths, laundry, and entry. Priced per sqft of tiled floor. Excludes natural stone and heated-floor systems.",
  "floor tile labor":
    "Set backer/uncoupling membrane, dry-layout for cuts, set floor tile flat and lippage-free, then grout, seal, and caulk changes of plane.",
  "shower tile":
    "Shower wall tile, waterproofing membrane, niche, curb, thinset, and grout for the surround. Priced per sqft of wall tile. Excludes steam-shower and full-slab surrounds.",
  "shower labor":
    "Waterproof the pan and walls to a tested watertight assembly, set wall tile, niche, and accents, then grout, seal, and caulk to finish.",
  "shower door (included material & labor)":
    "Framed or semi-frameless tempered-glass shower enclosure, supplied, measured, and installed. Priced per shower. Excludes frameless heavy-glass and custom steam enclosures.",

  // ── cabinetry / equipment ──
  "kitchen cabinets":
    "Semi-custom kitchen cabinetry — boxes, doors, drawers, fillers, toe kick, and crown — delivered and installed level and scribed. Priced per linear foot of run. Excludes islands beyond standard, glass doors, and specialty inserts.",
  "cabinet & drawer hardware":
    "Pulls, knobs, soft-close hinges and drawer glides, and organizer/roll-out inserts for the cabinetry package, installed and aligned.",
  "countertop material":
    "Quartz or granite slab with eased/standard edge, sink and cooktop cutouts, and any matching slab backsplash. Priced per sqft of counter. Excludes waterfall ends, mitered edges, and premium stone groups.",
  "countertop labor":
    "Template, fabricate, transport, and install tops with seams, supports, and undermount sink set, sealed and caulked.",
  "backsplash material":
    "Tile, thinset, grout, edge trim, and accents for the kitchen backsplash. Priced per backsplash area. Excludes full-height slab and mosaic feature walls.",
  "backsplash labor":
    "Layout, set, grout, and seal the backsplash tile to a finished edge around outlets and windows.",
  "laundry cabinets":
    "Laundry-room upper/base cabinetry and utility sink base, delivered and installed level. Priced per linear foot.",
  appliances:
    "ALLOWANCE — no MHP price history, so this is a budget figure, not a proven rate. Covers range, vent hood, dishwasher, microwave, and refrigerator. Standard ~$5,000; Builder ~$2,500; Custom $10,000–14,000. Confirm the exact models against the selection sheet — this line moves the most with taste.",

  // ── remodel-specific ──
  "structure demolition":
    "Selective demolition of existing finishes, cabinetry, fixtures, and flooring down to studs/subfloor, with dust protection of adjacent areas, salvage where directed, and debris removal. Excludes hazardous-material (asbestos/lead) abatement.",
  "porch material":
    "Pressure-treated or composite framing, decking, posts, beams, joist hangers, and fasteners for an open porch or deck surface. Priced per sqft. Excludes roof structure, railings upgrades, and screen systems.",
  "porch labor":
    "Set footings/posts and framing to code, install decking, skirting, and stairs, and trim to a finished, code-compliant walking surface and guard height.",
};

// What each CSI division/phase of the build covers — shown under the division header.
// Keys are the EXACT division names the catalog uses (after the "Division N:" prefix), normalized.
export const DIVISION_DETAIL: Record<string, string> = {
  "general requirements":
    "Project setup and overhead — permits, supervision, insurance, temporary facilities, layout, and cleanup that span the whole job.",
  "existing conditions": "Demolition, abatement, and prep of what's already on site before new work begins.",
  concrete: "Foundation system — footings, slab, forming, and reinforcement from layout through finished pour.",
  masonry: "Brick, block, and stone veneer including ties, flashing, weeps, and mortar.",
  metal: "Structural and miscellaneous metals — beams, columns, and connectors.",
  "wood, plastics, composites":
    "Rough and finish carpentry — framing, sheathing, trusses, trim, millwork, and cabinetry blocking.",
  "thermal & moisture protection":
    "The weather envelope — roofing, siding, insulation, flashing, gutters, and air-sealing that keep water and air out.",
  "openings (doors & windows)":
    "Doors and windows — supply, set, flash, weatherstrip, and hardware.",
  finishes:
    "Interior finishes — drywall, paint, trim, flooring, and tile that turn the shell into rooms.",
  specialties: "Specialty items — accessories, partitions, and built-in features.",
  furnishings: "Cabinetry and tops — kitchen, bath, and laundry casework with counters, backsplash, and hardware.",
  equipment: "Appliances and installed equipment allowances.",
  plumbing: "Water, waste, and gas — supply, DWV, fixtures, and the water heater, tested and inspected.",
  hvac: "Heating and cooling — equipment, ductwork, and controls sized to the load.",
  electrical: "Power and lighting — service, rough-in, devices, fixtures, and inspections per NEC.",
  earthwork: "Site grading, excavation, backfill, and soil prep for the build pad.",
  "exterior improvements": "Site-built exterior work — porches, decks, flatwork, and hardscape.",
  utilities: "Service connections and site utility runs.",
  other: "Miscellaneous scope not assigned to a primary division.",
};

// Document-level detail — the scope, assumptions, exclusions, and terms that wrap the line items.
export const ESTIMATE_SCOPE = {
  included: [
    "Permits coordination, supervision, and progress + final cleaning",
    "Builder's risk, temporary power/water, dumpsters, and port-a-john",
    "All labor, material, and standard fasteners/connectors for the lines shown",
    "Standard inspections and code-required testing for each trade",
  ],
  excluded: [
    "Land, lot clearing/grading beyond pad prep, and boundary/topographic survey",
    "Septic, well, and utility tap/impact fees",
    "Hazardous-material abatement (asbestos, lead, mold)",
    "Owner-supplied items, designer/luxury fixture and hardware upgrades",
    "Anything not on a line item — added by change order",
  ],
  assumptions: [
    "Quantities are takeoff estimates — confirm against final plans before contract.",
    "Allowance lines (e.g. appliances, fixtures) are budgets; final cost follows selections.",
    "Site is accessible, cleared, and rough-graded; normal soil bearing assumed.",
    "Pricing reflects current material costs and may move ±5–10% with market, season, and plan complexity.",
  ],
  terms: [
    "Estimate valid 30 days from issue.",
    "Allowances reconciled to actual at selection; over/under adjusts by change order.",
    "Draw schedule by phase; deposit due at contract.",
    "A locked GMP is available once plan, lot, and finishes are confirmed.",
  ],
};

const norm = (d: string | null | undefined) =>
  String(d ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function detailFor(description: string | null | undefined): string | null {
  return LINE_DETAIL[norm(description)] ?? null;
}

// Division labels arrive like "Division 9: Finishes" — match on the trailing name, then the number word.
export function divisionDetailFor(division: string | null | undefined): string | null {
  const raw = norm(division);
  if (!raw) return null;
  const name = raw.split(":").pop()?.trim() ?? raw;
  return DIVISION_DETAIL[name] ?? DIVISION_DETAIL[raw] ?? null;
}
