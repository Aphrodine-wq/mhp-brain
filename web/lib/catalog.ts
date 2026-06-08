import { db } from "./db";

// Faithful port of estimate.load_catalog: a canon_desc can have several unit variants
// (sqft vs a few stray 'each'); keep the DOMINANT one — most jobs — so a 3-job outlier
// can't hijack a 68-job line. ORDER BY n_jobs DESC + first-wins does exactly that.

// Allowance lines — items MHP doesn't have priced history for (so no proven median),
// carried as judgment-set allowances. Kept in code (not the synced catalog tables) so they
// survive DB re-syncs and stay clearly separate from history-derived rates. jobs:0 flags
// them as allowances in the UI. Values from Custom Home Tiers (Builder→Custom).
const ALLOWANCES: Record<string, LumpEntry & { canon: string }> = {
  appliances: {
    canon: "appliances",
    item_no: "11.31",
    division: "Division 11: Equipment",
    jobs: 0,
    median: 5000, // Standard tier (~$4.5–5k); Builder ~$2,500, Custom ~$10–14k
    p25: 2500,
    p75: 12000,
  },
};

export interface UnitEntry {
  item_no: string | null;
  division: string | null;
  unit: string | null;
  jobs: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
}
export interface LumpEntry {
  item_no: string | null;
  division: string | null;
  jobs: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export async function loadCatalog(): Promise<{
  unit: Map<string, UnitEntry>;
  lump: Map<string, LumpEntry>;
}> {
  const unit = new Map<string, UnitEntry>();
  const ur = await db.execute(
    "SELECT item_no,canon_desc,division,unit,n_jobs,median_unit_price,p25,p75 FROM unit_costs ORDER BY n_jobs DESC",
  );
  for (const r of ur.rows) {
    const cd = String(r.canon_desc);
    if (unit.has(cd)) continue;
    unit.set(cd, {
      item_no: r.item_no as string | null,
      division: r.division as string | null,
      unit: r.unit as string | null,
      jobs: Number(r.n_jobs),
      median: r.median_unit_price as number | null,
      p25: r.p25 as number | null,
      p75: r.p75 as number | null,
    });
  }

  const lump = new Map<string, LumpEntry>();
  const lr = await db.execute(
    "SELECT item_no,canon_desc,division,n_jobs,median_total,p25,p75 FROM lump_costs ORDER BY n_jobs DESC",
  );
  for (const r of lr.rows) {
    const cd = String(r.canon_desc);
    if (lump.has(cd)) continue;
    lump.set(cd, {
      item_no: r.item_no as string | null,
      division: r.division as string | null,
      jobs: Number(r.n_jobs),
      median: r.median_total as number | null,
      p25: r.p25 as number | null,
      p75: r.p75 as number | null,
    });
  }

  // merge allowances (no proven history) — don't overwrite a real catalog entry if one exists
  for (const [, a] of Object.entries(ALLOWANCES)) {
    if (!lump.has(a.canon)) {
      lump.set(a.canon, { item_no: a.item_no, division: a.division, jobs: a.jobs, median: a.median, p25: a.p25, p75: a.p75 });
    }
  }
  return { unit, lump };
}

// n_jobs map keyed by canon_desc, last-wins over natural row order — mirrors margin()'s
// `dict(con.execute("SELECT canon_desc,n_jobs FROM unit_costs"))` exactly.
export async function loadNJobs(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const r = await db.execute("SELECT canon_desc,n_jobs FROM unit_costs");
  for (const row of r.rows) m.set(String(row.canon_desc), Number(row.n_jobs));
  return m;
}
