import { cache } from "react";
import { db } from "./db";
import { loadCatalog, loadNJobs } from "./catalog";
import { loadOverrides, subKey } from "./overrides";

// Faithful TS ports of app.py's read functions. Queries are batched (no per-row round-trips)
// so this stays fast on Turso, but the computed results match the Python exactly.
// Corrections are applied as a read-time overlay (see lib/overrides.ts).

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

type Est = { sov: number | null; date: string; id: string };

// app.py project_value: current bid = latest-dated estimate with non-zero total (not biggest revision).
// est_date is filename-derived and can collide/misdate, so id breaks ties deterministically —
// the same estimate always wins instead of depending on SQL row order.
//
// The id is a TEXT slug ("rdb-working-folder-nmhp-vet-...-xlsx"), so it compares as a string. It
// used to be coerced with Number(), which made every id NaN and every tie `NaN > NaN` — false. The
// reduce then silently kept whichever row Postgres happened to return first, so a project with
// several same-dated revisions showed an arbitrary one. On the vet clinic that meant the bid tile
// read $255,777 (a cost-plus side estimate) while the margin tile, which orders by `id DESC` in
// SQL, was computed from the $1,498,480 bid right next to it. Same order as margin.ts now.
export function projectValue(ests: Est[]): number {
  const priced = ests.filter((e) => e.sov && e.sov > 0).map((e) => ({ sov: e.sov as number, d: e.date || "", id: e.id }));
  if (priced.length === 0) return 0;
  const dated = priced.filter((x) => x.d);
  if (dated.length) {
    return dated.reduce((a, b) => (b.d > a.d || (b.d === a.d && b.id > a.id) ? b : a)).sov;
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
  category: "Residential" | "Commercial";
  phase: string;
  /** 0-100, or null when nobody has put a number on it yet (distinct from 0 = not started). */
  completion: number | null;
  /** Where else this job lives — rendered as outbound chips on the cards. */
  trelloUrl: string | null;
  quickbooksUrl: string | null;
}

// Future-dated activity is always dirty import data (we've seen 2027/2028 rows) — clamp it away
// rather than show "last activity 2028" on a card.
function clampActivity(la: string | null): string {
  if (!la) return "";
  return la > new Date().toISOString().slice(0, 7) ? "" : la;
}

export const projectsList = cache(async function projectsList(): Promise<ProjectRow[]> {
  const ov = await loadOverrides("project");
  const prows = (await db.execute(
    "SELECT id,name,type,status,market,last_activity,current_phase,completion_pct,trello_url,quickbooks_url FROM projects",
  )).rows;
  const erows = (
    // Project value math: only CLEAN estimates count. FLAGGED (PHASE_ONLY / DUPLICATE_EXPORT)
    // would overstate or double-count a project's value. List/detail views below keep FLAGGED
    // visible with a confidence badge — this is the value rollup, not a list.
    await db.execute("SELECT project_id,sum_sov_total,est_date,id FROM estimates WHERE parse_confidence='CLEAN'")
  ).rows;

  const estByProject = new Map<string, Est[]>();
  for (const e of erows) {
    const pid = String(e.project_id);
    if (!estByProject.has(pid)) estByProject.set(pid, []);
    estByProject.get(pid)!.push({ sov: e.sum_sov_total as number | null, date: (e.est_date as string | null) ?? "", id: String(e.id) });
  }

  const out: ProjectRow[] = prows.map((p) => {
    const pid = String(p.id);
    const ests = estByProject.get(pid) ?? [];
    const o = ov.get(pid); // overlay: status / market / type
    const type = (o?.type ?? (p.type as string | null)) ?? "";
    return {
      id: pid,
      name: String(p.name),
      type,
      status: o?.status ?? String(p.status),
      market: (o?.market ?? (p.market as string | null)) ?? "",
      last: clampActivity(p.last_activity as string | null),
      value: pyRound(projectValue(ests)),
      estimates: ests.length,
      category: categoryOf(type),
      phase: String(p.current_phase ?? ""),
      completion: p.completion_pct == null ? null : Number(p.completion_pct),
      trelloUrl: (p.trello_url as string | null) || null,
      quickbooksUrl: (p.quickbooks_url as string | null) || null,
    };
  });

  out.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.value - a.value);
  return out;
});

export interface SubRow {
  name: string;
  key: string;
  trade: string;
  phone: string;
  license: string;
  jobs: number;
  projects: string;
  source: string;
  verified: boolean;
}

export const subsList = cache(async function subsList(): Promise<SubRow[]> {
  const ov = await loadOverrides("sub");
  let rows;
  try {
    rows = (await db.execute("SELECT name,trade,phone,jobs,projects,source FROM subs ORDER BY jobs DESC, name")).rows;
  } catch {
    return [];
  }
  return rows.map((r) => {
    const name = String(r.name);
    const k = subKey(name);
    const o = ov.get(k) ?? {};
    return {
      name,
      key: k,
      trade: o.trade ?? ((r.trade as string | null) ?? ""),
      phone: o.phone ?? ((r.phone as string | null) ?? ""),
      license: o.license ?? "",
      jobs: Number(r.jobs ?? 0),
      projects: (r.projects as string | null) ?? "",
      source: (r.source as string | null) ?? "",
      verified: o.verified === "true",
    };
  });
});

export interface CrewRow {
  name: string;
  key: string;
  role: string;
  rate: string | null;
  phone: string | null;
  email: string | null;
  // app-owned profile extras (overrides overlay, entity_type "crew")
  hireDate: string;
  address: string;
  emergencyContact: string;
  certifications: string;
  notes: string;
}

export const crewList = cache(async function crewList(): Promise<CrewRow[]> {
  let rows;
  let ov;
  try {
    ov = await loadOverrides("crew");
    rows = (await db.execute("SELECT name,role,rate,phone,email FROM crew")).rows;
  } catch {
    return [];
  }
  return rows.map((r) => {
    const name = String(r.name);
    const k = subKey(name);
    const o = ov.get(k) ?? {};
    return {
      name,
      key: k,
      role: o.role ?? String(r.role),
      rate: o.rate ?? (r.rate as string | null),
      phone: o.phone ?? (r.phone as string | null),
      email: o.email ?? (r.email as string | null),
      hireDate: o.hire_date ?? "",
      address: o.address ?? "",
      emergencyContact: o.emergency_contact ?? "",
      certifications: o.certifications ?? "",
      notes: o.notes ?? "",
    };
  });
});

export interface CatalogRow {
  description: string;
  rate: number | null;
  unit: string;
  division: string;
  item_no: string;
  jobs: number;
}

export const catalogList = cache(async function catalogList(): Promise<CatalogRow[]> {
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
});

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

export const stats = cache(async function stats(): Promise<Stats> {
  const pl = await projectsList();
  const counts: Record<string, number> = {};
  for (const p of pl) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const active_value = pl.filter((p) => p.status === "Active").reduce((s, p) => s + p.value, 0);

  const g = async (sql: string) => Number((await db.execute(sql)).rows[0].n);
  const has = async (t: string) =>
    Number(
      (await db.execute({ sql: "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name=?", args: [t] })).rows[0].n,
    ) > 0;

  return {
    active: counts["Active"] ?? 0,
    active_value: pyRound(active_value || 0),
    aging: counts["Aging"] ?? 0,
    bid: counts["Bid"] ?? 0,
    paused: counts["Paused"] ?? 0,
    projects: pl.length,
    line_items: await g("SELECT COUNT(*) AS n FROM line_items"),
    subs: (await has("subs")) ? await g("SELECT COUNT(*) AS n FROM subs") : 0,
    crew: (await has("crew")) ? await g("SELECT COUNT(*) AS n FROM crew") : 0,
  };
});

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

  const markup: MarginResult["markup"] = [];
  const seen = new Set<string>();
  const mkRows = (
    await db.execute(`
      SELECT e.source_file,p.name,p.status,e.sum_item_total,e.sum_sov_total,e.est_date
      FROM estimates e JOIN projects p ON p.id=e.project_id
      WHERE e.parse_confidence='CLEAN' AND e.sum_item_total>0 AND e.sum_sov_total>0
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

  const leak = new Map<string, { desc: string; n: number; gap: number; p: number[] }>();
  const liRows = (
    await db.execute(`
      SELECT li.canon_desc,li.description,li.qty,li.unit_price,li.norm_unit
      FROM line_items li JOIN estimates e ON e.id=li.estimate_id
      WHERE li.price_kind='UNIT_RATE' AND li.qty>0 AND li.unit_price>0
        AND e.parse_confidence='CLEAN'`)
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
    if (typ >= 0.45 && e.n < 15) continue;
    items.push({ item: e.desc, jobs: e.n, under: pyRound(typ * 100), recoverable: pyRound(e.gap) });
  }
  items.sort((a, b) => b.recoverable - a.recoverable);
  const total = items.reduce((s, i) => s + i.recoverable, 0);
  return { recoverable: total, markup, items: items.slice(0, 14) };
}

function medianOf(vals: number[]): number {
  const v = [...vals].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface LiveFlag {
  level: string;
  text: string;
  key: string;
}
export interface LiveJob {
  name: string;
  status: string;
  market: string;
  last: string;
  value: number;
  delta: number | null;
  revisions: number;
  flags: LiveFlag[];
  health: string;
}
export interface LiveResult {
  jobs: LiveJob[];
  priorities: LiveFlag[];
}

// Faithful port of live_data(): forward look on active/aging/bid jobs, plus flag-dismissal overlay.
export async function liveData(): Promise<LiveResult> {
  const { unit } = await loadCatalog();
  const flagOv = await loadOverrides("live_flag");
  const dismissed = (pid: string, ftype: string) => flagOv.get(`${pid}:${ftype}`)?.dismissed === "true";

  const candidates = (
    await db.execute("SELECT id,name,status,market,last_activity FROM projects WHERE status IN ('Active','Aging','Bid')")
  ).rows;
  const pids = candidates.map((r) => String(r.id));
  if (pids.length === 0) return { jobs: [], priorities: [] };

  const placeholders = pids.map(() => "?").join(",");
  const estRows = (
    await db.execute({
      sql: `SELECT project_id,id,sum_sov_total,est_date FROM estimates WHERE parse_confidence='CLEAN' AND project_id IN (${placeholders})`,
      args: pids,
    })
  ).rows;
  const estByProject = new Map<string, { id: string; sov: number | null; date: string }[]>();
  for (const e of estRows) {
    const pid = String(e.project_id);
    if (!estByProject.has(pid)) estByProject.set(pid, []);
    estByProject.get(pid)!.push({ id: String(e.id), sov: e.sum_sov_total as number | null, date: (e.est_date as string | null) ?? "" });
  }

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
  const priorities: LiveFlag[] = [];
  for (const r of candidates) {
    const pid = String(r.id);
    const name = String(r.name);
    const status = String(r.status);
    const market = (r.market as string | null) ?? "";
    const la = (r.last_activity as string | null) ?? "";
    const { eid, value, revs } = chosen.get(pid)!;
    const delta = pricingDelta(eid);
    const flags: LiveFlag[] = [];
    const add = (arr: LiveFlag[], level: string, text: string, ftype: string) => {
      if (!dismissed(pid, ftype)) arr.push({ level, text, key: `${pid}:${ftype}` });
    };

    if ((status === "Active" || status === "Aging") && value === 0) {
      add(flags, "red", "No priced estimate on file", "no_estimate");
      if (status === "Active") add(priorities, "red", `${name}: no estimate on file — price it`, "no_estimate");
    }
    if (status === "Aging") {
      add(priorities, "amber", `${name}: quiet since ${la || "?"} — still active, or close it out?`, "aging_confirm");
    }
    if (delta !== null && delta < -0.04) {
      const lvl = delta < -0.1 ? "red" : "amber";
      add(flags, lvl, `Priced ${Math.round(Math.abs(delta) * 100)}% below your norm — margin risk`, "underpriced");
      if (lvl === "red" && status === "Active") {
        add(priorities, "red", `${name}: bid ${Math.round(Math.abs(delta) * 100)}% under your historical pricing — check margin`, "underpriced");
      }
    }
    if (delta !== null && delta > 0.08) {
      add(flags, "green", `Priced ${Math.round(delta * 100)}% above norm — healthy cushion`, "healthy");
    }
    if (revs >= 5) {
      add(flags, "amber", `${revs} estimate revisions — scope still moving`, "scope_moving");
    }
    if (status === "Bid") {
      add(priorities, "blue", `${name}: bid out, not signed — follow up`, "bid_followup");
    }

    const levels = flags.map((f) => f.level);
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
  priorities.sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));
  return { jobs, priorities };
}

export interface EstimateRow {
  id: string;
  project: string;
  projectId: string;
  date: string;
  source: string;
  lineItems: number;
  total: number;
  confidence: string;
  hasDoc: boolean; // true if the original .xlsx is stored; the URL stays server-side (gated download)
  category: "Residential" | "Commercial";
}

// Project type strings tag commercial work explicitly — "Commercial (Bank)", "Storage / Commercial".
// Everything else MHP does is residential.
const categoryOf = (type: string): "Residential" | "Commercial" =>
  /commercial/i.test(type) ? "Commercial" : "Residential";

// the SELECT columns every estimate-row consumer needs (estimatesList, estimateDetail, projectDetail)
const EST_ROW_SQL = `
  SELECT e.id, e.project_id, e.source_file, e.line_item_count,
         e.sum_sov_total, e.sum_item_total, e.stated_total, e.parse_confidence, e.est_date,
         (ef.source_file IS NOT NULL) AS has_doc, p.name, p.type AS project_type
  FROM estimates e JOIN projects p ON p.id = e.project_id
  LEFT JOIN estimate_files ef ON ef.source_file = e.source_file`;

// typeOverride: the corrected project type from the overrides overlay, when one exists
function mapEstimateRow(r: Record<string, unknown>, typeOverride?: string): EstimateRow {
  const sov = r.sum_sov_total as number | null;
  const item = r.sum_item_total as number | null;
  const stated = r.stated_total as number | null;
  const total = sov && sov > 0 ? sov : stated && stated > 0 ? stated : item ?? 0;
  const d = ((r.est_date as string | null) ?? "").slice(0, 10);
  // source_file is a long raw path/sheet string — show just the filename, no extension.
  const src = (((r.source_file as string | null) ?? "").split(/[/\\]/).pop() ?? "").replace(/\.(xlsx?|pdf|csv)$/i, "").trim();
  return {
    id: String(r.id),
    project: String(r.name),
    projectId: String(r.project_id),
    date: d.startsWith("0000") ? "" : d,
    source: src,
    lineItems: Number(r.line_item_count ?? 0),
    total: pyRound(total ?? 0),
    confidence: (r.parse_confidence as string | null) ?? "",
    hasDoc: Boolean(r.has_doc), // original file stored in private estimate_files (Postgres)
    category: categoryOf(typeOverride ?? ((r.project_type as string | null) ?? "")),
  };
}

// Every parsed estimate on file, newest first — the index behind the Estimates tab.
export const estimatesList = cache(async function estimatesList(): Promise<EstimateRow[]> {
  let rows;
  let ov;
  try {
    ov = await loadOverrides("project");
    rows = (
      await db.execute(`${EST_ROW_SQL}
        WHERE e.parse_confidence != 'FAILED'
        ORDER BY e.est_date DESC NULLS LAST, p.name`)
    ).rows;
  } catch {
    return [];
  }
  return rows.map((r) => mapEstimateRow(r, ov.get(String(r.project_id))?.type ?? undefined));
});

export interface EstimateLineItem {
  division: string;
  itemNo: string;
  description: string;
  qty: number | null;
  unit: string;
  unitPrice: number | null;
  itemTotal: number | null;
  sovTotal: number | null;
  subName: string;
}

export interface EstimateDetail extends EstimateRow {
  sumItemTotal: number;
  sumSovTotal: number;
  lines: EstimateLineItem[];
}

// One estimate with its full line-item breakdown — the page behind a clicked Estimates row.
export async function estimateDetail(id: string): Promise<EstimateDetail | null> {
  try {
    const rows = (await db.execute({ sql: `${EST_ROW_SQL} WHERE e.id = ?`, args: [id] })).rows;
    if (!rows.length) return null;
    const head = rows[0];
    const ov = await loadOverrides("project");
    const lrows = (
      await db.execute({
        sql: `SELECT division, item_no, description, qty, unit, unit_price, item_total, sov_total, sub_name
              FROM line_items WHERE estimate_id = ? ORDER BY id`,
        args: [id],
      })
    ).rows;
    return {
      ...mapEstimateRow(head, ov.get(String(head.project_id))?.type ?? undefined),
      sumItemTotal: pyRound((head.sum_item_total as number | null) ?? 0),
      sumSovTotal: pyRound((head.sum_sov_total as number | null) ?? 0),
      lines: lrows.map((l) => ({
        division: (l.division as string | null) ?? "",
        itemNo: (l.item_no as string | null) ?? "",
        description: (l.description as string | null) ?? "",
        qty: l.qty as number | null,
        unit: (l.unit as string | null) ?? "",
        unitPrice: l.unit_price as number | null,
        itemTotal: l.item_total as number | null,
        sovTotal: l.sov_total as number | null,
        subName: (l.sub_name as string | null) ?? "",
      })),
    };
  } catch {
    return null;
  }
}

export interface ProjectDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  market: string;
  last: string;
  value: number;
  estimates: EstimateRow[];
}

// One project with its estimates on file — the page behind a clicked Projects row.
export async function projectDetail(id: string): Promise<ProjectDetail | null> {
  try {
    const prows = (
      await db.execute({ sql: "SELECT id,name,type,status,market,last_activity FROM projects WHERE id = ?", args: [id] })
    ).rows;
    if (!prows.length) return null;
    const p = prows[0];
    const ov = await loadOverrides("project");
    const o = ov.get(String(p.id)); // overlay: status / market / type — same corrections as the list
    const erows = (
      await db.execute({
        sql: `${EST_ROW_SQL}
          WHERE e.project_id = ? AND e.parse_confidence != 'FAILED'
          ORDER BY e.est_date DESC NULLS LAST`,
        args: [id],
      })
    ).rows;
    const ests = erows.map((r) => mapEstimateRow(r, o?.type ?? undefined));
    return {
      id: String(p.id),
      name: String(p.name),
      type: (o?.type ?? (p.type as string | null)) ?? "",
      status: o?.status ?? String(p.status),
      market: (o?.market ?? (p.market as string | null)) ?? "",
      last: (p.last_activity as string | null) ?? "",
      // Value rollup uses only CLEAN estimates (FLAGGED/SUPERSEDED would mis-pick the bid);
      // the displayed `ests` list above keeps them visible with a confidence badge.
      value: pyRound(projectValue(
        erows
          .filter((e) => e.parse_confidence === "CLEAN")
          .map((e) => ({ sov: e.sum_sov_total as number | null, date: ((e.est_date as string | null) ?? ""), id: String(e.id) })),
      )),
      estimates: ests,
    };
  } catch {
    return null;
  }
}
