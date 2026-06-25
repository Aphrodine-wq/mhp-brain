// Pure (no-db) flywheel logic — safe to import from client components. The db-backed reads live
// in lib/flywheel.ts, which re-exports everything here. Keeping these separate means the estimator
// (a client component) can compute the bid-calibration insight live, from a factor passed down by
// the server, without dragging the pg client into the browser bundle.

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

export interface BidRealizationInsight {
  factor: number;
  expectedActual: number;   // bid * factor
  deltaPct: number;         // (factor - 1) * 100 — positive = likely to run OVER the bid
  confidence: Confidence;
  nJobs: number;
  basis: "type" | "portfolio";
  note: string;
}

// How a bid of `bid` dollars is likely to land, given a learned factor. Pure — the caller decides
// where the factor comes from (server read). On low/none confidence the note declines to adjust:
// we surface the signal but never steer a bid off thin data.
export function insightFrom(factor: RealizationFactor | null, bid: number): BidRealizationInsight | null {
  if (!(bid > 0) || !factor) return null;
  const confidence = confidenceOf(factor);
  const deltaPct = (factor.factor - 1) * 100;
  const basis: "type" | "portfolio" = factor.dimension === "type" ? "type" : "portfolio";

  let note: string;
  if (confidence === "none" || confidence === "low") {
    note = `Only ${factor.nJobs} closed job${factor.nJobs === 1 ? "" : "s"} with actuals${factor.stdev > 0.25 ? " and a wide spread" : ""} — not enough history to calibrate this bid yet.`;
  } else {
    const dir = deltaPct >= 0 ? "over" : "under";
    note = `${basis === "type" ? "This job type" : "Jobs"} historically land ~${Math.abs(deltaPct).toFixed(0)}% ${dir} bid (${factor.nJobs} closeouts).`;
  }

  return { factor: factor.factor, expectedActual: bid * factor.factor, deltaPct, confidence, nJobs: factor.nJobs, basis, note };
}
