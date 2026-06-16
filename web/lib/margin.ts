import { db } from "@/lib/db";

// Estimated-margin lens — bid vs estimated cost vs collected, computed purely from data already in
// the web DB. "Margin" here is ESTIMATED (what the bid implied: marked-up sell minus pre-markup
// cost), NOT actual cost — true cost lives in QuickBooks (qb_pnl.py) and isn't wired in yet. The
// shape leaves room for actual cost to slot in later.
//   bid           = estimates.sum_sov_total (marked-up sell — same source as the "bid value" tile)
//   estimatedCost = estimates.sum_item_total (Σ item total, pre-markup)
//   collected     = SUM(payments.amount)

export interface ProjectMargin {
  bid: number | null;
  estimatedCost: number | null;
  marginDollars: number | null;
  marginPct: number | null;
  collected: number;
  collectedPct: number | null;
}

export async function projectMargin(projectId: string): Promise<ProjectMargin> {
  let bid: number | null = null;
  let estimatedCost: number | null = null;
  try {
    const r = (await db.execute({
      sql: `SELECT sum_sov_total, sum_item_total FROM estimates
            WHERE project_id = ? AND parse_confidence != 'FAILED' AND sum_sov_total > 0
            ORDER BY est_date DESC LIMIT 1`,
      args: [projectId],
    })).rows[0];
    if (r) {
      bid = r.sum_sov_total != null ? Number(r.sum_sov_total) : null;
      estimatedCost = r.sum_item_total ? Number(r.sum_item_total) : null;
    }
  } catch { /* estimates table absent */ }

  let collected = 0;
  try {
    const r = (await db.execute({ sql: "SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE project_id = ?", args: [projectId] })).rows[0];
    collected = Number(r?.t ?? 0);
  } catch { /* payments table arrives with the QB pipe */ }

  let contract: number | null = null;
  try {
    const r = (await db.execute({ sql: "SELECT contract_value FROM projects WHERE id = ?", args: [projectId] })).rows[0];
    contract = r?.contract_value != null ? Number(r.contract_value) : null;
  } catch { /* ignore */ }

  const marginDollars = bid != null && estimatedCost != null ? bid - estimatedCost : null;
  const marginPct = marginDollars != null && bid ? marginDollars / bid : null;
  const denom = contract || bid || 0;
  const collectedPct = denom ? collected / denom : null;

  return { bid, estimatedCost, marginDollars, marginPct, collected, collectedPct };
}

export interface MarginSegment {
  label: string;
  jobs: number;
  bid: number;
  cost: number;
  marginDollars: number;
  marginPct: number | null;
}

export interface MarginRollup {
  portfolioBid: number;
  portfolioCost: number;
  portfolioMarginPct: number | null;
  byType: MarginSegment[];
  byMarket: MarginSegment[];
}

// Portfolio roll-up: latest estimate per project, grouped by job type and by market.
export async function marginBySegment(): Promise<MarginRollup> {
  let rows: { project_id: string; sov: number; item: number; date: string; type: string; market: string }[] = [];
  try {
    rows = (await db.execute(`
      SELECT e.project_id, e.sum_sov_total AS sov, e.sum_item_total AS item, e.est_date AS date,
             COALESCE(p.type,'—') AS type, COALESCE(p.market,'—') AS market
      FROM estimates e JOIN projects p ON p.id = e.project_id
      WHERE e.parse_confidence != 'FAILED' AND e.sum_sov_total > 0 AND e.sum_item_total > 0
    `)).rows.map((r) => ({
      project_id: String(r.project_id), sov: Number(r.sov), item: Number(r.item),
      date: String(r.date ?? ""), type: String(r.type), market: String(r.market),
    }));
  } catch { /* estimates absent */ }

  // collapse to the latest estimate per project
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const prev = latest.get(r.project_id);
    if (!prev || r.date > prev.date) latest.set(r.project_id, r);
  }
  const jobs = [...latest.values()];

  const group = (key: "type" | "market"): MarginSegment[] => {
    const m = new Map<string, { jobs: number; bid: number; cost: number }>();
    for (const j of jobs) {
      const k = j[key] || "—";
      const cur = m.get(k) ?? { jobs: 0, bid: 0, cost: 0 };
      cur.jobs += 1; cur.bid += j.sov; cur.cost += j.item;
      m.set(k, cur);
    }
    return [...m.entries()]
      .map(([label, v]) => ({ label, jobs: v.jobs, bid: v.bid, cost: v.cost, marginDollars: v.bid - v.cost, marginPct: v.bid ? (v.bid - v.cost) / v.bid : null }))
      .sort((a, b) => b.marginDollars - a.marginDollars);
  };

  const portfolioBid = jobs.reduce((s, j) => s + j.sov, 0);
  const portfolioCost = jobs.reduce((s, j) => s + j.item, 0);
  return {
    portfolioBid,
    portfolioCost,
    portfolioMarginPct: portfolioBid ? (portfolioBid - portfolioCost) / portfolioBid : null,
    byType: group("type"),
    byMarket: group("market"),
  };
}
