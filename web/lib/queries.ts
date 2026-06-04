import { db } from "./db";
import { loadCatalog, loadNJobs } from "./catalog";

// Faithful TS ports of app.py's read functions. Queries are batched (no per-row round-trips)
// so this stays fast on Turso, but the computed results match the Python exactly.

const STATUS_RANK: Record<string, number> = {
  Active: 0,
  Aging: 1,
  Bid: 2,
  Paused: 3,
  "Likely Done": 4,
  Unknown: 5,
  Dead: 6,
};

// Python's round() is round-half-to-even (banker's). Replicate it so aggregate dollars match
// the Python app exactly, instead of drifting by $1 on .5 ties (Math.round is half-up).
function pyRound(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac < 0.5) return floor;
  if (frac > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

type Est = { sov: number | null; date: string };

// app.py project_value: current bid = latest-dated estimate with non-zero total (not biggest revision).
function projectValue(ests: Est[]): number {
  const priced = ests.filter((e) => e.sov && e.sov > 0).map((e) => ({ sov: e.sov as number, d: e.date || "" }));
  if (priced.length === 0) return 0;
  const dated = priced.filter((x) => x.d);
  if (dated.length) {
    return dated.reduce((a, b) => (b.d > a.d ? b : a)).sov;
  }
  return Math.max(...priced.map((p) => p.sov));
}

export interface ProjectRow {
  id: string;
  name: string;
  type: string;
  status: string;
  market: string;
  last: string;
  value: number;
  estimates: number;
}

export async function projectsList(): Promise<ProjectRow[]> {
  const prows = (await db.execute("SELECT id,name,type,status,market,last_activity FROM projects")).rows;
  const erows = (
    await db.execute("SELECT project_id,sum_sov_total,est_date FROM estimates WHERE parse_confidence!='FAILED'")
  ).rows;

  const estByProject = new Map<string, Est[]>();
  for (const e of erows) {
    const pid = String(e.project_id);
    if (!estByProject.has(pid)) estByProject.set(pid, []);
    estByProject.get(pid)!.push({ sov: e.sum_sov_total as number | null, date: (e.est_date as string | null) ?? "" });
  }

  const out: ProjectRow[] = prows.map((p) => {
    const pid = String(p.id);
    const ests = estByProject.get(pid) ?? [];
    return {
      id: pid,
      name: String(p.name),
      type: (p.type as string | null) ?? "",
      status: String(p.status),
      market: (p.market as string | null) ?? "",
      last: (p.last_activity as string | null) ?? "",
      value: pyRound(projectValue(ests)),
      estimates: ests.length,
    };
  });

  out.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.value - a.value);
  return out;
}

export interface SubRow {
  name: string;
  trade: string;
  phone: string;
  jobs: number;
  projects: string;
  source: string;
}

export async function subsList(): Promise<SubRow[]> {
  let rows;
  try {
    rows = (await db.execute("SELECT name,trade,phone,jobs,projects,source FROM subs ORDER BY jobs DESC, name")).rows;
  } catch {
    return [];
  }
  return rows.map((r) => ({
    name: String(r.name),
    trade: (r.trade as string | null) ?? "",
    phone: (r.phone as string | null) ?? "",
    jobs: Number(r.jobs ?? 0),
    projects: (r.projects as string | null) ?? "",
    source: (r.source as string | null) ?? "",
  }));
}

export interface CrewRow {
  name: string;
  role: string;
  rate: string | null;
  phone: string | null;
  email: string | null;
}

export async function crewList(): Promise<CrewRow[]> {
  let rows;
  try {
    rows = (await db.execute("SELECT name,role,rate,phone,email FROM crew")).rows;
  } catch {
    return [];
  }
  return rows.map((r) => ({
    name: String(r.name),
    role: String(r.role),
    rate: r.rate as string | null,
    phone: r.phone as string | null,
    email: r.email as string | null,
  }));
}

export interface CatalogRow {
  description: string;
  rate: number | null;
  unit: string;
  division: string;
  item_no: string;
  jobs: number;
}

export async function catalogList(): Promise<CatalogRow[]> {
  const { unit, lump } = await loadCatalog();

  // display description from the catalog tables (unit wins via setdefault order)
  const disp = new Map<string, string>();
  for (const r of (await db.execute("SELECT DISTINCT description FROM unit_costs")).rows) {
    if (r.description != null) disp.set(canonKey(String(r.description)), String(r.description));
  }
  for (const r of (await db.execute("SELECT DISTINCT description FROM lump_costs")).rows) {
    if (r.description != null) {
      const k = canonKey(String(r.description));
      if (!disp.has(k)) disp.set(k, String(r.description));
    }
  }

  // {**lump, **unit} — unit overrides lump on key collision
  const merged = new Map<string, { rate: number | null; unit: string; division: string; item_no: string; jobs: number }>();
  for (const [cd, h] of lump) {
    merged.set(cd, { rate: h.median, unit: "lump", division: h.division ?? "", item_no: h.item_no ?? "", jobs: h.jobs });
  }
  for (const [cd, h] of unit) {
    merged.set(cd, { rate: h.median, unit: h.unit ?? "lump", division: h.division ?? "", item_no: h.item_no ?? "", jobs: h.jobs });
  }

  const rows: CatalogRow[] = [];
  for (const [cd, h] of merged) {
    rows.push({ description: disp.get(cd) ?? cd, rate: h.rate, unit: h.unit, division: h.division, item_no: h.item_no, jobs: h.jobs });
  }
  rows.sort((a, b) => b.jobs - a.jobs);
  return rows;
}

// local canon (avoid import cycle clarity) — identical to canon.ts
function canonKey(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export interface Stats {
  active: number;
  active_value: number;
  aging: number;
  bid: number;
  paused: number;
  projects: number;
  line_items: number;
  subs: number;
  crew: number;
}

export async function stats(): Promise<Stats> {
  const pl = await projectsList();
  const counts: Record<string, number> = {};
  for (const p of pl) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const active_value = pl.filter((p) => p.status === "Active").reduce((s, p) => s + p.value, 0);

  const g = async (sql: string) => Number((await db.execute(sql)).rows[0][0]);
  const has = async (t: string) =>
    Number((await db.execute({ sql: "SELECT COUNT(*) FROM sqlite_master WHERE name=?", args: [t] })).rows[0][0]) > 0;

  return {
    active: counts["Active"] ?? 0,
    active_value: pyRound(active_value || 0),
    aging: counts["Aging"] ?? 0,
    bid: counts["Bid"] ?? 0,
    paused: counts["Paused"] ?? 0,
    projects: pl.length,
    line_items: await g("SELECT COUNT(*) FROM line_items"),
    subs: (await has("subs")) ? await g("SELECT COUNT(*) FROM subs") : 0,
    crew: (await has("crew")) ? await g("SELECT COUNT(*) FROM crew") : 0,
  };
}

const MED_MK = 1.178;

export interface MarginResult {
  recoverable: number;
  markup: { name: string; status: string; markup: number; uplift: number }[];
  items: { item: string; jobs: number; under: number; recoverable: number }[];
}

// Faithful port of margin(): two profit leaks measured vs MHP's own history.
export async function margin(): Promise<MarginResult> {
  const { unit } = await loadCatalog();
  const njobs = await loadNJobs();

  // (1) markup leaks — active/aging/bid jobs bid thin, deduped by project name (first seen wins)
  const markup: MarginResult["markup"] = [];
  const seen = new Set<string>();
  const mkRows = (
    await db.execute(`
      SELECT e.source_file,p.name,p.status,e.sum_item_total,e.sum_sov_total,e.est_date
      FROM estimates e JOIN projects p ON p.id=e.project_id
      WHERE e.parse_confidence!='FAILED' AND e.sum_item_total>0 AND e.sum_sov_total>0
        AND p.status IN ('Active','Aging','Bid')`)
  ).rows;
  for (const r of mkRows) {
    const name = String(r.name);
    if (seen.has(name)) continue;
    seen.add(name);
    const item = Number(r.sum_item_total);
    const sov = Number(r.sum_sov_total);
    const mk = sov / item;
    if (mk < MED_MK - 0.005) {
      markup.push({ name, status: String(r.status), markup: pyRound((mk - 1) * 100), uplift: pyRound(item * MED_MK - sov) });
    }
  }
  markup.sort((a, b) => b.uplift - a.uplift);

  // (2) systematic line-item underpricing
  const leak = new Map<string, { desc: string; n: number; gap: number; p: number[] }>();
  const liRows = (
    await db.execute(`
      SELECT li.canon_desc,li.description,li.qty,li.unit_price,li.norm_unit
      FROM line_items li JOIN estimates e ON e.id=li.estimate_id
      WHERE li.price_kind='UNIT_RATE' AND li.qty>0 AND li.unit_price>0
        AND e.parse_confidence!='FAILED'`)
  ).rows;
  for (const r of liRows) {
    const cd = r.canon_desc == null ? "" : String(r.canon_desc);
    const h = unit.get(cd);
    const nu = (r.norm_unit as string | null) ?? "";
    if (!h || !h.median || (h.unit ?? "") !== nu || (njobs.get(cd) ?? 0) < 5) continue;
    const med = h.median;
    const up = Number(r.unit_price);
    const qty = Number(r.qty);
    if (up < med * 0.97) {
      let e = leak.get(cd);
      if (!e) {
        e = { desc: String(r.description), n: 0, gap: 0, p: [] };
        leak.set(cd, e);
      }
      e.n += 1;
      e.gap += Math.min(med - up, med * 0.5) * qty;
      e.p.push(Math.min((med - up) / med, 0.5));
    }
  }

  const items: MarginResult["items"] = [];
  for (const e of leak.values()) {
    const typ = medianOf(e.p);
    if (typ >= 0.45 && e.n < 15) continue; // drop low-confidence artifacts
    items.push({ item: e.desc, jobs: e.n, under: pyRound(typ * 100), recoverable: pyRound(e.gap) });
  }
  items.sort((a, b) => b.recoverable - a.recoverable);
  const total = items.reduce((s, i) => s + i.recoverable, 0);
  return { recoverable: total, markup, items: items.slice(0, 14) };
}

// statistics.median — average of the two middles on even-length
function medianOf(vals: number[]): number {
  const v = [...vals].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

type Flag = [string, string];
export interface LiveJob {
  name: string;
  status: string;
  market: string;
  last: string;
  value: number;
  delta: number | null;
  revisions: number;
  flags: Flag[];
  health: string;
}
export interface LiveResult {
  jobs: LiveJob[];
  priorities: Flag[];
}

// Faithful port of live_data(): forward look on active/aging/bid jobs.
export async function liveData(): Promise<LiveResult> {
  const { unit } = await loadCatalog();

  const candidates = (
    await db.execute("SELECT id,name,status,market,last_activity FROM projects WHERE status IN ('Active','Aging','Bid')")
  ).rows;
  const pids = candidates.map((r) => String(r.id));
  if (pids.length === 0) return { jobs: [], priorities: [] };

  // all non-failed estimates for candidate projects, grouped
  const placeholders = pids.map(() => "?").join(",");
  const estRows = (
    await db.execute({
      sql: `SELECT project_id,id,sum_sov_total,est_date FROM estimates WHERE parse_confidence!='FAILED' AND project_id IN (${placeholders})`,
      args: pids,
    })
  ).rows;
  const estByProject = new Map<string, { id: string; sov: number | null; date: string }[]>();
  for (const e of estRows) {
    const pid = String(e.project_id);
    if (!estByProject.has(pid)) estByProject.set(pid, []);
    estByProject.get(pid)!.push({ id: String(e.id), sov: e.sum_sov_total as number | null, date: (e.est_date as string | null) ?? "" });
  }

  // latest_priced per project
  function latestPriced(pid: string): { eid: string | null; value: number; revs: number } {
    const ests = estByProject.get(pid) ?? [];
    const priced = ests.filter((e) => e.sov && e.sov > 0);
    if (priced.length === 0) return { eid: null, value: 0, revs: 0 };
    const dated = priced.filter((x) => x.date && !x.date.includes("-00-00"));
    const pick = dated.length
      ? dated.reduce((a, b) => (b.date > a.date ? b : a))
      : priced.reduce((a, b) => ((b.sov as number) > (a.sov as number) ? b : a));
    return { eid: pick.id, value: pick.sov as number, revs: priced.length };
  }

  const chosen = new Map<string, { eid: string | null; value: number; revs: number }>();
  for (const pid of pids) chosen.set(pid, latestPriced(pid));

  // pricing_delta inputs: line_items for the chosen estimate ids
  const eids = [...chosen.values()].map((c) => c.eid).filter((e): e is string => e != null);
  const liByEst = new Map<string, { cd: string; qty: number; up: number; nu: string }[]>();
  if (eids.length) {
    const ph = eids.map(() => "?").join(",");
    const liRows = (
      await db.execute({
        sql: `SELECT estimate_id,canon_desc,qty,unit_price,norm_unit FROM line_items WHERE price_kind='UNIT_RATE' AND qty>0 AND unit_price>0 AND estimate_id IN (${ph})`,
        args: eids,
      })
    ).rows;
    for (const r of liRows) {
      const eid = String(r.estimate_id);
      if (!liByEst.has(eid)) liByEst.set(eid, []);
      liByEst.get(eid)!.push({
        cd: r.canon_desc == null ? "" : String(r.canon_desc),
        qty: Number(r.qty),
        up: Number(r.unit_price),
        nu: (r.norm_unit as string | null) ?? "",
      });
    }
  }

  function pricingDelta(eid: string | null): number | null {
    if (!eid) return null;
    const rows = liByEst.get(eid) ?? [];
    let num = 0;
    let den = 0;
    for (const { cd, qty, up, nu } of rows) {
      const h = unit.get(cd);
      if (h && h.median && (h.unit ?? "") === nu) {
        const dev = Math.max(-0.5, Math.min(0.5, (up - h.median) / h.median));
        const w = qty * h.median;
        num += w * dev;
        den += w;
      }
    }
    return den ? num / den : null;
  }

  const jobs: LiveJob[] = [];
  const priorities: Flag[] = [];
  for (const r of candidates) {
    const pid = String(r.id);
    const name = String(r.name);
    const status = String(r.status);
    const market = (r.market as string | null) ?? "";
    const la = (r.last_activity as string | null) ?? "";
    const { eid, value, revs } = chosen.get(pid)!;
    const delta = pricingDelta(eid);
    const flags: Flag[] = [];

    if ((status === "Active" || status === "Aging") && value === 0) {
      flags.push(["red", "No priced estimate on file"]);
      if (status === "Active") priorities.push(["red", `${name}: no estimate on file — price it`]);
    }
    if (status === "Aging") {
      priorities.push(["amber", `${name}: quiet since ${la || "?"} — still active, or close it out?`]);
    }
    if (delta !== null && delta < -0.04) {
      const lvl = delta < -0.1 ? "red" : "amber";
      flags.push([lvl, `Priced ${Math.round(Math.abs(delta) * 100)}% below your norm — margin risk`]);
      if (lvl === "red" && status === "Active") {
        priorities.push(["red", `${name}: bid ${Math.round(Math.abs(delta) * 100)}% under your historical pricing — check margin`]);
      }
    }
    if (delta !== null && delta > 0.08) {
      flags.push(["green", `Priced ${Math.round(delta * 100)}% above norm — healthy cushion`]);
    }
    if (revs >= 5) {
      flags.push(["amber", `${revs} estimate revisions — scope still moving`]);
    }
    if (status === "Bid") {
      priorities.push(["blue", `${name}: bid out, not signed — follow up`]);
    }

    const levels = flags.map((f) => f[0]);
    const health = levels.includes("red") ? "red" : levels.includes("amber") ? "amber" : "green";
    if (status === "Active") {
      jobs.push({
        name,
        status,
        market,
        last: la,
        value: pyRound(value),
        delta: delta !== null ? pyRound(delta * 100) : null,
        revisions: revs,
        flags,
        health,
      });
    }
  }

  const order: Record<string, number> = { red: 0, amber: 1, green: 2 };
  jobs.sort((a, b) => order[a.health] - order[b.health] || b.value - a.value);
  priorities.sort((a, b) => (order[a[0]] ?? 3) - (order[b[0]] ?? 3));
  return { jobs, priorities };
}
