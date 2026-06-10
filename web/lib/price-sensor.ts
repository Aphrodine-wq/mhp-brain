// Price sensor (PRICE_SENSOR.md, the in-app slice) — tracked materials with three
// price signals per row:
//   market   — retail price, fed by the local scraper via /api/pricing/ingest or typed in
//   recent   — MHP's own rate on this line across the last 12 months of estimates
//   baseline — MHP's all-time rate (what the estimator catalog charges)
// Drift between them is the "are we charging enough for materials" answer.
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { sendAlert } from "@/lib/alerts";

export interface TrackedMaterial {
  id: string;
  name: string;
  unit: string;
  catalogDesc: string; // estimator line this maps to (canon-matched)
  marketPrice: number | null;
  marketSource: string | null;
  marketUpdatedAt: string;
  rateRecent: number | null;
  rateBaseline: number | null;
  ratesUpdatedAt: string;
  active: boolean;
  stale: boolean; // market price older than 8 days — the weekly feed missed a beat
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS tracked_materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT,
    catalog_desc TEXT,
    market_price DOUBLE PRECISION,
    market_source TEXT,
    market_updated_at TEXT,
    rate_recent DOUBLE PRECISION,
    rate_baseline DOUBLE PRECISION,
    rates_updated_at TEXT,
    active BOOLEAN DEFAULT TRUE
  )`);
  ensured = true;
}

// Mirrors the scraper basket (ftw-scraper config/mhp-materials.json) — names must match
// exactly so /api/pricing/ingest lands by name. Every material-bearing division covered.
const SEED: { name: string; unit: string; catalogDesc: string }[] = [
  // Div 6 — lumber & framing
  { name: "2x4x8 SPF Stud", unit: "each", catalogDesc: "Framing Material" },
  { name: "2x6x8 SPF #2 Stud", unit: "each", catalogDesc: "Framing Material" },
  { name: "2x8x10 SYP #2", unit: "each", catalogDesc: "Framing Material" },
  { name: "7/16 in. 4x8 OSB Sheathing", unit: "sheet", catalogDesc: "Framing Material" },
  { name: "3/4 in. 4x8 CDX Plywood", unit: "sheet", catalogDesc: "Framing Material" },
  { name: "1.75 in. x 9.5 in. x 16 ft. LVL Beam", unit: "each", catalogDesc: "Framing Material" },
  // Div 9 — drywall & finishes
  { name: "1/2 in. 4x8 Drywall Sheet", unit: "sheet", catalogDesc: "Drywall" },
  { name: "5/8 in. 4x8 Type X Fire-Code Drywall", unit: "sheet", catalogDesc: "Drywall" },
  { name: "All-Purpose Joint Compound 4.5 gal.", unit: "each", catalogDesc: "Drywall" },
  { name: "Luxury Vinyl Plank 7 in. x 48 in. (24 sq ft box)", unit: "box", catalogDesc: "LVT Flooring - Materials" },
  { name: "Behr Premium Plus 1 gal. Interior Latex Paint", unit: "each", catalogDesc: "Interior Paint Material" },
  { name: "12x24 Porcelain Floor Tile (sq ft)", unit: "sqft", catalogDesc: "Floor Tile" },
  // Div 7 — envelope
  { name: "R-13 15 in. Kraft Faced Insulation Batt", unit: "bag", catalogDesc: "Insulation Material" },
  { name: "R-19 Unfaced Fiberglass Roll", unit: "bag", catalogDesc: "Insulation Material" },
  { name: "Architectural Asphalt Shingles (33.3 sq ft bundle)", unit: "bundle", catalogDesc: "Shingle Roofing Material" },
  { name: "15 lb. Roofing Felt 400 sq ft. roll", unit: "each", catalogDesc: "Shingle Roofing Material" },
  { name: "D4 Double 4 in. Lap Vinyl Siding White (24 sq ft sq)", unit: "each", catalogDesc: "Siding Material" },
  { name: "5 in. K-Style Aluminum Gutter 10 ft.", unit: "each", catalogDesc: "Gutter Material" },
  // Div 3 — concrete
  { name: "Quikrete 80 lb. Concrete Mix", unit: "bag", catalogDesc: "Slab Material" },
  { name: "#4 Rebar 20 ft.", unit: "each", catalogDesc: "Concrete Forming Material (Includes Reinforcement)" },
  { name: "6x6 #10 Wire Remesh 5x10 ft.", unit: "sheet", catalogDesc: "Concrete Forming Material (Includes Reinforcement)" },
  // Div 4 — masonry
  { name: "8x8x16 Concrete Block CMU", unit: "each", catalogDesc: "Block Material" },
  // Div 8 — openings
  { name: "36x60 Vinyl Double Hung Window Low-E", unit: "each", catalogDesc: "Windows" },
  { name: "6-Panel Hollow Core Prehung Interior Door 32 in.", unit: "each", catalogDesc: "Interior Doors" },
  { name: "Fiberglass Prehung Front Entry Door 36 in.", unit: "each", catalogDesc: "Exterior Doors" },
  // Div 12 — casework
  { name: "36 in. Shaker Base Kitchen Cabinet", unit: "each", catalogDesc: "Kitchen Cabinets" },
  // Div 22 — plumbing
  { name: "3/4 in. PEX-A Pipe 100 ft.", unit: "roll", catalogDesc: "Plumbing Material & Labor" },
  { name: "40 Gal. Electric Water Heater", unit: "each", catalogDesc: "Water Heaters" },
  // Div 23 — HVAC
  { name: "3 Ton 14.3 SEER2 Air Conditioner Condenser", unit: "each", catalogDesc: "HVAC Material" },
  // Div 26 — electrical
  { name: "12/2 Romex NM-B Wire 250 ft.", unit: "roll", catalogDesc: "Electrical Material" },
  { name: "200 Amp 40-Space Main Breaker Panel", unit: "each", catalogDesc: "Electrical Material" },
  // second wave — trim, outdoor, fixtures, casework
  { name: "1x4x8 Primed MDF Trim Board", unit: "each", catalogDesc: "Interior Trim Material" },
  { name: "5/4x6x12 Pressure Treated Deck Board", unit: "each", catalogDesc: "Porch Material" },
  { name: "4x4x8 Pressure Treated Post", unit: "each", catalogDesc: "Wood Post & Column Material" },
  { name: "House Wrap 9 ft. x 150 ft. Roll", unit: "roll", catalogDesc: "Siding Material" },
  { name: "James Hardie 8.25 in. Fiber Cement Lap Siding 12 ft.", unit: "each", catalogDesc: "Siding Material" },
  { name: "6 in. LED Recessed Light 6-Pack", unit: "pack", catalogDesc: "Lighting Fixtures" },
  { name: "Kwikset Entry Door Knob and Deadbolt Combo", unit: "each", catalogDesc: "Door Hardware" },
  { name: "3x6 Ceramic Subway Tile White (sq ft)", unit: "sqft", catalogDesc: "Backsplash Material" },
  { name: "36 in. Bathroom Vanity with Top", unit: "each", catalogDesc: "Bathroom Vanities" },
  { name: "Quartz Countertop Installed (sq ft)", unit: "sqft", catalogDesc: "Countertop Material" },
  { name: "Round Toilet 1.28 GPF Two-Piece", unit: "each", catalogDesc: "Plumbing Fixtures" },
  { name: "3 in. x 10 ft. PVC DWV Pipe", unit: "each", catalogDesc: "Plumbing Material & Labor" },
];

// first-generation generic seeds, superseded by the basket-aligned list above
const RETIRED_SEEDS = [
  "Framing lumber package", "Drywall (hung + finished)", "Architectural shingles",
  "Ready-mix concrete", "LVT flooring", "Insulation", "Fiber-cement siding",
  "Windows (vinyl, low-E)", "Kitchen cabinets", "Countertop slab",
];

// idempotent: insert any basket material that isn't tracked yet; retire old generics
// that never got a feed (keeps anything a human priced by hand).
async function reconcileSeeds() {
  const existing = new Set(
    (await db.execute("SELECT LOWER(name) AS n FROM tracked_materials")).rows.map((r) => String(r.n)),
  );
  for (const m of SEED) {
    if (existing.has(m.name.toLowerCase())) continue;
    await db.execute({
      sql: "INSERT INTO tracked_materials (id, name, unit, catalog_desc, active) VALUES (?, ?, ?, ?, TRUE)",
      args: [randomUUID(), m.name, m.unit, m.catalogDesc],
    });
  }
  await db.execute({
    sql: `UPDATE tracked_materials SET active = FALSE
          WHERE market_price IS NULL AND name = ANY(string_to_array(?, '||'))`,
    args: [RETIRED_SEEDS.join("||")],
  });
}

const toRow = (r: Record<string, unknown>): TrackedMaterial => ({
  id: String(r.id),
  name: String(r.name),
  unit: String(r.unit ?? ""),
  catalogDesc: String(r.catalog_desc ?? ""),
  marketPrice: r.market_price == null ? null : Number(r.market_price),
  marketSource: (r.market_source as string | null) ?? null,
  marketUpdatedAt: String(r.market_updated_at ?? "").slice(0, 10),
  rateRecent: r.rate_recent == null ? null : Number(r.rate_recent),
  rateBaseline: r.rate_baseline == null ? null : Number(r.rate_baseline),
  ratesUpdatedAt: String(r.rates_updated_at ?? "").slice(0, 10),
  active: Boolean(r.active),
  stale:
    r.market_price != null &&
    Date.now() - new Date(String(r.market_updated_at ?? "")).getTime() > 8 * 864e5,
});

export async function listMaterials(): Promise<TrackedMaterial[]> {
  await ensure();
  await reconcileSeeds();
  const rows = (await db.execute("SELECT * FROM tracked_materials WHERE active = TRUE ORDER BY name")).rows;
  return rows.map(toRow);
}

export async function upsertMaterial(m: { id?: string; name: string; unit?: string; catalogDesc?: string }): Promise<string> {
  await ensure();
  if (m.id) {
    await db.execute({
      sql: "UPDATE tracked_materials SET name = ?, unit = ?, catalog_desc = ? WHERE id = ?",
      args: [m.name, m.unit ?? "", m.catalogDesc ?? "", m.id],
    });
    return m.id;
  }
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO tracked_materials (id, name, unit, catalog_desc, active) VALUES (?, ?, ?, ?, TRUE)",
    args: [id, m.name, m.unit ?? "", m.catalogDesc ?? ""],
  });
  return id;
}

export async function removeMaterial(id: string): Promise<void> {
  await ensure();
  await db.execute({ sql: "UPDATE tracked_materials SET active = FALSE WHERE id = ?", args: [id] });
}

export async function setMarketPrice(id: string, price: number, source: string): Promise<void> {
  await ensure();
  await db.execute({
    sql: "UPDATE tracked_materials SET market_price = ?, market_source = ?, market_updated_at = now()::text WHERE id = ?",
    args: [price, source, id],
  });
}

// The Run button: recompute MHP's own rates per tracked line from estimate history —
// recent (last 365 days) vs all-time medians of the line's unit price.
export async function recomputeRates(): Promise<{ updated: number }> {
  await ensure();
  const mats = (await db.execute("SELECT id, catalog_desc FROM tracked_materials WHERE active = TRUE")).rows;
  let updated = 0;
  for (const m of mats) {
    const desc = String(m.catalog_desc ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!desc) continue;
    const stats = (
      await db.execute({
        sql: `SELECT
                percentile_cont(0.5) WITHIN GROUP (ORDER BY li.unit_price) AS all_med,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY li.unit_price)
                  FILTER (WHERE e.est_date >= to_char(now() - interval '365 days', 'YYYY-MM-DD')) AS recent_med
              FROM line_items li
              JOIN estimates e ON e.id = li.estimate_id
              WHERE LOWER(regexp_replace(li.description, '\\s+', ' ', 'g')) = ?
                AND li.unit_price IS NOT NULL AND li.unit_price > 0`,
        args: [desc],
      })
    ).rows[0];
    await db.execute({
      sql: "UPDATE tracked_materials SET rate_baseline = ?, rate_recent = ?, rates_updated_at = now()::text WHERE id = ?",
      args: [stats?.all_med == null ? null : Number(stats.all_med), stats?.recent_med == null ? null : Number(stats.recent_med), m.id],
    });
    updated++;
  }
  return { updated };
}

// HMAC-verified ingest for the local price scraper (same posture as the ftw-svc pipe).
// Body: { items: [{ name | id, price, source? }] }, header x-pricing-signature = hex hmac of raw body.
export function verifyIngestSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.PRICING_INGEST_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ingestPrices(items: { id?: string; name?: string; price: number; source?: string }[]): Promise<number> {
  await ensure();
  let updated = 0;
  const movers: string[] = [];
  for (const it of items) {
    if (!Number.isFinite(it.price) || it.price <= 0) continue;
    const r = it.id
      ? await db.execute({
          sql: `UPDATE tracked_materials SET market_price = ?, market_source = ?, market_updated_at = now()::text
                WHERE id = ? RETURNING name, (SELECT market_price FROM tracked_materials WHERE id = ?) AS old_price`,
          args: [it.price, it.source ?? "scraper", it.id, it.id],
        })
      : await db.execute({
          sql: `UPDATE tracked_materials t SET market_price = ?, market_source = ?, market_updated_at = now()::text
                FROM (SELECT id, market_price AS old_price FROM tracked_materials WHERE LOWER(name) = LOWER(?)) prev
                WHERE t.id = prev.id RETURNING t.name, prev.old_price`,
          args: [it.price, it.source ?? "scraper", String(it.name ?? "")],
        });
    if (r.rows.length) {
      updated++;
      const old = r.rows[0].old_price == null ? null : Number(r.rows[0].old_price);
      if (old && Math.abs(it.price - old) / old >= 0.1) {
        const pct = Math.round(((it.price - old) / old) * 100);
        movers.push(`${String(r.rows[0].name)}: $${old} → $${it.price} (${pct > 0 ? "+" : ""}${pct}%)`);
      }
    }
  }
  // material costs moving double digits is a reprice signal — say so in the channel
  if (movers.length) {
    void sendAlert({
      title: "Material prices moved — check the estimator rates",
      urgent: true,
      lines: movers.slice(0, 10),
    });
  }
  return updated;
}
