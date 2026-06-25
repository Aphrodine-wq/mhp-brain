import { db } from "@/lib/db";
import { type RealizationFactor, type BidRealizationInsight, insightFrom } from "@/lib/flywheel-insight";

// Read side of the actuals→catalog flywheel (flywheel.py). The pipeline learns a realization
// factor per dimension (portfolio / job type / market) from closed jobs — actual vs bid,
// EWMA-weighted and shrunk toward 1.0 for thin buckets. This exposes it to the estimator with
// an HONEST confidence gate: a factor learned from a handful of noisy closeouts must read as
// "not enough history," never silently steer a real bid. It sharpens as QuickBooks + OCR feed
// in more confirmed actuals; until then most reads return low/none confidence on purpose.
//
// The pure compute helpers (confidenceOf / insightFrom / the types) live in flywheel-insight.ts
// so client components can use them without the db import; re-exported here for server callers.
export { confidenceOf, insightFrom } from "@/lib/flywheel-insight";
export type { RealizationFactor, Confidence, BidRealizationInsight } from "@/lib/flywheel-insight";

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

// For the estimator: how a bid of `bid` dollars for an optional job `type` is likely to land,
// gated on confidence. Returns null when there's no history at all. The compute is pure
// (insightFrom); this just supplies the factor from the DB (type bucket, else portfolio).
export async function bidRealization(bid: number, type?: string | null): Promise<BidRealizationInsight | null> {
  if (!(bid > 0)) return null;
  return insightFrom(await realizationForType(type), bid);
}
