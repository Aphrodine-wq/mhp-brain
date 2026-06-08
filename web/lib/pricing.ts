import { loadCatalog } from "./catalog";
import { canon } from "./canon";
import { qtyFor, type Detected } from "./parse-job";
import { detailFor } from "./line-detail";

// Faithful port of app.build_lines — attach catalog rate/unit/band, seed qty from each line's unit.

export interface SeedLine {
  description: string;
  detail: string | null; // intense scope detail (lib/line-detail)
  qty: number | null;
  rate: number | null;
  unit: string | null;
  division: string;
  item_no: string;
  jobs: number;
  p25: number | null;
  p75: number | null;
  kind: string;
}

export async function buildLines(
  descriptions: string[],
  detected: Detected,
  qtyByCanon?: Map<string, number>,
): Promise<SeedLine[]> {
  const { unit, lump } = await loadCatalog();
  const out: SeedLine[] = [];
  // assembly-driven qty (explicit per line) wins over the single-dimension guess
  const seeded = (cd: string, fallback: number | null) => qtyByCanon?.get(cd) ?? fallback;
  for (const desc of descriptions) {
    const cd = canon(desc);
    const u = unit.get(cd);
    if (u) {
      // Python: h.get("unit", "lump") returns the stored unit (which may be null) — only
      // defaults to "lump" on a MISSING key, not a null value. Keep null as null.
      const uu = u.unit;
      out.push({
        description: desc,
        detail: detailFor(desc),
        qty: seeded(cd, qtyFor(uu, desc, detected)),
        rate: u.median,
        unit: uu,
        division: u.division ?? "",
        item_no: u.item_no ?? "",
        jobs: u.jobs,
        p25: u.p25,
        p75: u.p75,
        kind: "unit",
      });
      continue;
    }
    const l = lump.get(cd);
    if (l) {
      out.push({
        description: desc,
        detail: detailFor(desc),
        qty: seeded(cd, qtyFor("lump", desc, detected)),
        rate: l.median,
        unit: "lump",
        division: l.division ?? "",
        item_no: l.item_no ?? "",
        jobs: l.jobs,
        p25: l.p25,
        p75: l.p75,
        kind: "lump",
      });
      continue;
    }
    out.push({ description: desc, detail: detailFor(desc), qty: null, rate: null, unit: "?", division: "", item_no: "", jobs: 0, p25: null, p75: null, kind: "missing" });
  }
  return out;
}
