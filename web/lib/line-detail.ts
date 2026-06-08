// Intense scope detail per line item — what each line actually includes (materials spec +
// labor scope), so an estimate reads like a real, defensible bid instead of a bare line.
// Keyed by canon(description) (lowercase, whitespace-collapsed) to match the catalog.
// buildLines attaches the matching detail to every line; the builder + xlsx export surface it.

export const LINE_DETAIL: Record<string, string> = {
  // ── general / sitework ──
  "general conditions":
    "Mobilization and general project overhead: builder's risk insurance, temporary power and water, dumpsters and debris haul-off, port-a-john, and final job-site cleanup. The fixed cost of running the job regardless of scope.",
  "project coordination (supervision)":
    "Active superintendence: scheduling and sequencing subs, ordering and staging materials, daily site walks, inspections coordination, and quality control through the build. Priced per supervision period.",
  "architectural plans":
    "Stamped construction drawings and engineering: floor plans, elevations, sections, foundation and framing details sufficient for permit and field use. Excludes survey and civil unless noted.",
  "construction staking":
    "Layout of building corners, setbacks, and foundation lines from the plot plan; batter boards and grade references set for the foundation crew.",
  "termite pre-treat":
    "Soil-applied termiticide barrier under and around the slab/footprint prior to pour, with the treatment certificate required for inspection and warranty.",

  // ── foundation / concrete ──
  "footing material":
    "Concrete, rebar, and form stakes for continuous perimeter and interior footings sized to the foundation plan. Priced per linear foot of footing run.",
  "footing labor":
    "Excavate, form, set rebar, and place/finish footings to grade and bearing depth, including inspection hold points before pour.",
  "concrete forming material (includes reinforcement)":
    "Slab forming lumber, vapor barrier, wire mesh/rebar reinforcement, and chairs for the slab pour, sized to the under-roof footprint.",
  "slab material":
    "Ready-mix concrete for the monolithic/raised slab and thickened edges, priced per cubic yard at the spec'd PSI mix.",
  "slab labor":
    "Set forms, place vapor barrier and reinforcement, pour, screed, float, and finish the slab; includes embeds and plumbing/electrical stub coordination.",

  // ── shell / framing / roof ──
  "framing material":
    "Dimensional lumber, sheathing, fasteners, and hardware for walls, floor system, and roof structure per plan — exterior load-bearing and interior partitions. Priced per under-roof sqft.",
  "framing labor":
    "Frame walls, set the floor/roof structure, sheathe, and dry-in rough openings square and plumb to plan, ready for mechanicals.",
  "trusses & trim joists":
    "Engineered roof trusses / I-joists and trim joists, delivered and set with bracing and hangers per the truss layout and engineering.",
  "shingle roofing material":
    "Architectural (dimensional) shingles, underlayment, ice-and-water at valleys/eaves, drip edge, ridge vent, and flashing. Priced per roofing square (100 sqft).",
  "shingle roofing labor":
    "Tear-off (if any), dry-in, flash penetrations and valleys, and install shingles and ridge to manufacturer spec for warranty.",
  "gutter material":
    "Seamless aluminum gutter, downspouts, hangers, and end caps sized to the roof drainage. Priced per linear foot.",
  "gutter labor":
    "Fabricate seamless runs on site, hang to pitch, and tie downspouts to grade/splash blocks.",

  // ── exterior envelope ──
  "siding material":
    "Fiber-cement (Hardie) lap or panel, house wrap, trim, flashing, and fasteners. Priced per sqft of wall area less openings.",
  "siding labor":
    "Install weather-resistive barrier, flash openings, and hang and fasten siding to spec with proper laps and clearances.",
  windows:
    "Supply and set vinyl/low-E insulated windows per the schedule, flashed and sealed to the WRB. Priced per opening; excludes interior trim.",
  "exterior doors":
    "Exterior door units (entry/garage-to-house/rear) with thresholds, weatherstrip, and lockset prep, set and flashed. Priced per opening.",
  "exterior trim material":
    "Fascia, frieze, corner boards, and door/window casing stock for the exterior. Priced per sqft of conditioned area as a proxy for trim run.",
  "exterior trim labor":
    "Cut and install exterior trim, fascia, and soffit; caulk and prep for paint.",
  "exterior paint material":
    "Exterior primer and two coats of paint/caulk for siding, trim, and soffit. Priced per exterior unit.",
  "exterior paint labor":
    "Pressure-prep, mask, prime, and apply exterior coatings to siding and trim.",

  // ── mechanicals ──
  "electrical material":
    "Wire, boxes, breakers, devices, fixtures rough stock, and panel per the electrical plan. Priced per under-roof sqft.",
  "electrical labor":
    "Rough-in branch circuits, set panel, and trim out devices, fixtures, and the panel to code with inspection.",
  "electrical meter (permanent power)":
    "Permanent service: meter base, service entrance, grounding, and utility coordination to energize the home.",
  "plumbing material & labor":
    "Supply, DWV, and gas rough-in plus fixture set per opening (each sink, toilet, tub/shower, water heater, hose bib). Priced per plumbing opening.",
  "plumbing fixtures":
    "Fixture allowance: toilets, lavatory and kitchen faucets, tub/shower valves and trim, and the water heater. Quality-dependent — confirm the selection sheet.",
  "plumbing gas materials and labor":
    "Gas piping and connections for tankless water heater, range, and/or HVAC, pressure-tested and inspected.",
  "hvac material":
    "Condenser, air handler/furnace, ductwork, registers, refrigerant, and thermostat sized to the load. Priced per system; ~1 system per 800 heated sqft.",

  // ── interior ──
  "insulation material":
    "Wall and ceiling insulation (batt/blown) plus air-sealing materials to meet the energy code. Priced per heated sqft.",
  "insulation labor":
    "Air-seal penetrations and install wall and attic insulation to the spec'd R-values with inspection.",
  drywall:
    "Hang, tape, and finish 1/2\" board on walls and ceilings to a Level 4 finish, ready for paint. Priced per sqft of board (~3× floor area for walls + ceiling).",
  "interior paint material":
    "Primer plus two coats wall paint and trim enamel, caulk, and patch compound. Priced per interior unit.",
  "interior paint labor":
    "Mask, prime, and paint walls, ceilings, and trim; caulk and touch-up to a finished surface.",
  "interior trim material":
    "Baseboard, casing, door jambs, shoe, and fasteners for the interior. Priced per heated sqft.",
  "interior trim labor":
    "Install doors, casing, base, and millwork; caulk and prep for paint to a finish-carpentry standard.",
  "interior doors":
    "Pre-hung interior door units per the schedule, set plumb with shims. Priced per opening; casing in interior trim.",
  "door hardware":
    "Passage/privacy/closet sets and hinges per opening, installed and adjusted.",
  "lvt flooring - materials":
    "Luxury vinyl plank with underlayment/transition strips for living areas. Priced per sqft of installed area (less tiled wet areas).",
  "lvt flooring - labor":
    "Prep and level substrate, lay out, and install LVP with transitions and trim.",
  "floor tile":
    "Porcelain/ceramic floor tile, thinset, grout, and backer for wet areas (baths, laundry, entry). Priced per sqft of tiled floor.",
  "floor tile labor":
    "Set backer/membrane, lay out and set floor tile, then grout and seal.",
  "shower tile":
    "Wall tile, waterproofing membrane, thinset, and grout for the shower surround. Priced per sqft of wall tile.",
  "shower labor":
    "Waterproof the pan and walls, set wall tile and niche, then grout and seal to a watertight finish.",
  "shower door (included material & labor)":
    "Framed/semi-frameless glass shower enclosure, supplied and installed. Priced per shower.",

  // ── cabinetry / equipment ──
  "kitchen cabinets":
    "Semi-custom kitchen cabinetry — boxes, doors, drawers, and crown — delivered and installed level. Priced per linear foot of run.",
  "cabinet & drawer hardware":
    "Pulls, knobs, soft-close hinges/glides, and any organizer inserts for the cabinetry package.",
  "countertop material":
    "Quartz/granite slab, edge profile, sink cutout, and backsplash slab if specified. Priced per sqft of counter.",
  "countertop labor":
    "Template, fabricate, and install tops with seams, supports, and undermount sink set.",
  "backsplash material":
    "Tile, thinset, grout, and trim for the kitchen backsplash. Priced per backsplash area.",
  "backsplash labor":
    "Lay out and set backsplash tile, grout, and seal to a finished edge.",
  "laundry cabinets":
    "Laundry-room cabinetry and utility sink base, delivered and installed. Priced per linear foot.",
  appliances:
    "ALLOWANCE (no MHP price history): range, vent hood, dishwasher, microwave, and refrigerator. Standard ~$5k; Builder ~$2.5k, Custom $10–14k. Confirm against the selection sheet.",

  // ── remodel-specific ──
  "structure demolition":
    "Selective demo of existing finishes/fixtures down to studs/subfloor, with protection of adjacent areas and debris removal.",
  "porch material":
    "Pressure-treated/composite framing and decking, posts, and fasteners for an open porch or deck surface. Priced per sqft.",
  "porch labor":
    "Set posts and framing, install decking and skirting, and trim to a finished walking surface.",
};

const norm = (d: string | null | undefined) =>
  String(d ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function detailFor(description: string | null | undefined): string | null {
  return LINE_DETAIL[norm(description)] ?? null;
}
