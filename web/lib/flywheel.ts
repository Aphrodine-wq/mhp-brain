import { db } from "@/lib/db";

// Read side of the actuals→catalog flywheel (flywheel.py). The pipeline learns a realization
// factor per dimension (portfolio / job type / market) from closed jobs — actual vs bid,
// EWMA-weighted and shrunk toward 1.0 for thin buckets. This exposes it to the estimator with
// an HONEST confidence gate: a factor learned from a handful of noisy closeouts must read as
// "not enough history," never silently steer a real bid. It sharpens as QuickBooks + OCR feed
// in more confirmed actuals; until then most reads return low/none confidence on purpose.

export interface RealizationFactor {
  dimension: string;
  key: string;
  factor: number;   // shrink-adjusted — the one to use for bidding
  rawFactor: number;
  nJobs: number;
  mean: number;
  stdev: number;
}

export type Confidence = "none" | "low" | "moderate" | "good";

// Confidence from sample size AND spread — a wide band of realizations is untrustworthy even
// with several jobs. Thresholds are deliberately conservative; loosen as the history grows.
export function confidenceOf(f: RealizationFactor | null): Confidence {
  if (!f || f.nJobs < 1) return "none";
  if (f.nJobs < 3 || f.stdev > 0.25) return "low";
  if (f.nJobs < 8 || f.stdev > 0.15) return "moderate";
  return "good";
}

function rowToFactor(r: Record<string, unknown>): RealizationFactor {
  return {
    dimension: String(r.dimension),
    key: String(r.key),
    factor: Number(r.factor),
    rawFactor: Number(r.raw_factor),
    nJobs: Number(r.n_jobs),
    mean: r.realization_mean == null ? 0 : Number(r.realization_mean),
    stdev: r.realization_stdev == null ? 0 : Number(r.realization_stdev),
  };
}

async function readFactor(dimension: string, key: string): Promise<RealizationFactor | null> {
  try {
    const r = (await db.execute({
      sql: `SELECT dimension, key, factor, raw_factor, n_jobs, realization_mean, realization_stdev
            FROM realization_factors WHERE dimension = ? AND key = ? LIMIT 1`,
      args: [dimension, key],
    })).rows[0];
    return r ? rowToFactor(r) : null;
  } catch {
    return null; // table absent until the first flywheel sync — estimator shows nothing
  }
}

export function portfolioRealization(): Promise<RealizationFactor | null> {
  return readFactor("portfolio", "all");
}

// The job-type factor if MHP has enough history for that type, else the portfolio factor.
export async function realizationForType(type: string | null | undefined): Promise<RealizationFactor | null> {
  if (type && type.trim()) {
    const t = await readFactor("type", type.trim());
    if (t) return t;
  }
  return portfolioRealization();
}

export interface BidRealizationInsight {
  factor: number;
  expectedActual: number;   // bid * factor
  deltaPct: number;         // (factor - 1) * 100 — positive = likely to run OVER the bid
  confidence: Confidence;
  nJobs: number;
  basis: "type" | "portfolio";
  note: string;
}

// For the estimator: how a bid of `bid` dollars for an optional job `type` is likely to land,
// gated on confidence. Returns null when there's no history at all. When confidence is "low",
// the note declines to adjust — we surface the signal but never steer a bid off thin data.
export async function bidRealization(bid: number, type?: string | null): Promise<BidRealizationInsight | null> {
  if (!(bid > 0)) return null;
  const f = await realizationForType(type);
  if (!f) return null;

  const confidence = confidenceOf(f);
  const deltaPct = (f.factor - 1) * 100;
  const basis: "type" | "portfolio" = f.dimension === "type" ? "type" : "portfolio";

  let note: string;
  if (confidence === "none" || confidence === "low") {
    note = `Only ${f.nJobs} closed job${f.nJobs === 1 ? "" : "s"} with actuals${f.stdev > 0.25 ? " and a wide spread" : ""} — not enough history to adjust this bid yet.`;
  } else {
    const dir = deltaPct >= 0 ? "over" : "under";
    note = `${basis === "type" ? "This job type" : "Jobs"} historically land ~${Math.abs(deltaPct).toFixed(0)}% ${dir} bid (${f.nJobs} closeouts).`;
  }

  return {
    factor: f.factor,
    expectedActual: bid * f.factor,
    deltaPct,
    confidence,
    nJobs: f.nJobs,
    basis,
    note,
  };
}
