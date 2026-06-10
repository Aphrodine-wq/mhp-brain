// Price sensor (PRICE_SENSOR.md, the in-app slice) — tracked materials with three
// price signals per row:
//   market   — retail price, fed by the local scraper via /api/pricing/ingest or typed in
//   recent   — MHP's own rate on this line across the last 12 months of estimates
//   baseline — MHP's all-time rate (what the estimator catalog charges)
// Drift between them is the "are we charging enough for materials" answer.
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

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

// estimator lines worth watching out of the box — seeded once when the table is empty
const SEED: { name: string; unit: string; catalogDesc: string }[] = [
  { name: "Framing lumber package", unit: "sqft", catalogDesc: "Framing Material" },
  { name: "Drywall (hung + finished)", unit: "board feet", catalogDesc: "Drywall" },
  { name: "Architectural shingles", unit: "square", catalogDesc: "Shingle Roofing Material" },
  { name: "Ready-mix concrete", unit: "cy", catalogDesc: "Slab Material" },
  { name: "LVT flooring", unit: "sqft", catalogDesc: "LVT Flooring - Materials" },
  { name: "Insulation", unit: "sqft", catalogDesc: "Insulation Material" },
  { name: "Fiber-cement siding", unit: "sqft", catalogDesc: "Siding Material" },
  { name: "Windows (vinyl, low-E)", unit: "opening", catalogDesc: "Windows" },
  { name: "Kitchen cabinets", unit: "lft", catalogDesc: "Kitchen Cabinets" },
  { name: "Countertop slab", unit: "sqft", catalogDesc: "Countertop Material" },
];

async function seedIfEmpty() {
  const n = (await db.execute("SELECT COUNT(*) AS n FROM tracked_materials")).rows[0];
  if (Number(n?.n ?? 0) > 0) return;
  for (const m of SEED) {
    await db.execute({
      sql: "INSERT INTO tracked_materials (id, name, unit, catalog_desc, active) VALUES (?, ?, ?, ?, TRUE)",
      args: [randomUUID(), m.name, m.unit, m.catalogDesc],
    });
  }
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
});

export async function listMaterials(): Promise<TrackedMaterial[]> {
  await ensure();
  await seedIfEmpty();
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
  for (const it of items) {
    if (!Number.isFinite(it.price) || it.price <= 0) continue;
    const r = it.id
      ? await db.execute({
          sql: "UPDATE tracked_materials SET market_price = ?, market_source = ?, market_updated_at = now()::text WHERE id = ? RETURNING id",
          args: [it.price, it.source ?? "scraper", it.id],
        })
      : await db.execute({
          sql: "UPDATE tracked_materials SET market_price = ?, market_source = ?, market_updated_at = now()::text WHERE LOWER(name) = LOWER(?) RETURNING id",
          args: [it.price, it.source ?? "scraper", String(it.name ?? "")],
        });
    if (r.rows.length) updated++;
  }
  return updated;
}
