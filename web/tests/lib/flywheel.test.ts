import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));

import { confidenceOf, bidRealization, type RealizationFactor } from "@/lib/flywheel";
import { db } from "@/lib/db";

const exec = db.execute as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

function factorRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    dimension: "portfolio", key: "all", factor: 1.0, raw_factor: 1.0,
    n_jobs: 10, realization_mean: 1.0, realization_stdev: 0.05, ...over,
  };
}

describe("confidenceOf", () => {
  const base: RealizationFactor = { dimension: "type", key: "k", factor: 1, rawFactor: 1, nJobs: 10, mean: 1, stdev: 0.05 };
  it("none when no factor or zero jobs", () => {
    expect(confidenceOf(null)).toBe("none");
    expect(confidenceOf({ ...base, nJobs: 0 })).toBe("none");
  });
  it("low on a thin sample OR a wide spread", () => {
    expect(confidenceOf({ ...base, nJobs: 2 })).toBe("low");
    expect(confidenceOf({ ...base, nJobs: 10, stdev: 0.40 })).toBe("low");
  });
  it("good only with enough jobs AND a tight band", () => {
    expect(confidenceOf({ ...base, nJobs: 10, stdev: 0.05 })).toBe("good");
    expect(confidenceOf({ ...base, nJobs: 5, stdev: 0.05 })).toBe("moderate");
  });
});

describe("bidRealization", () => {
  it("returns null for a non-positive bid", async () => {
    expect(await bidRealization(0)).toBeNull();
  });

  it("returns null when no factor exists yet (table absent / empty)", async () => {
    exec.mockResolvedValue({ rows: [] });
    expect(await bidRealization(100000, "Kitchen")).toBeNull();
  });

  it("declines to adjust on low confidence (thin/noisy history)", async () => {
    // Mirrors today's real data: 4 jobs, wide spread → low confidence, no steering.
    // readFactor('type','Kitchen') misses, then portfolioRealization() hits.
    exec
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [factorRow({ n_jobs: 4, factor: 0.86, raw_factor: 0.76, realization_stdev: 0.46 })] });
    const r = await bidRealization(100000, "Kitchen");
    expect(r).not.toBeNull();
    expect(r!.confidence).toBe("low");
    expect(r!.note).toMatch(/not enough history/i);
  });

  it("surfaces an over-bid warning when confidence is good", async () => {
    // type factor present, well-populated, tight band, runs 8% over bid
    exec.mockResolvedValueOnce({ rows: [factorRow({ dimension: "type", key: "Deck", factor: 1.08, raw_factor: 1.09, n_jobs: 12, realization_stdev: 0.08 })] });
    const r = await bidRealization(50000, "Deck");
    expect(r!.basis).toBe("type");
    expect(r!.confidence).toBe("good");
    expect(r!.expectedActual).toBeCloseTo(54000, 0); // 50000 * 1.08
    expect(r!.deltaPct).toBeCloseTo(8, 5);
    expect(r!.note).toMatch(/over bid/i);
  });

  it("falls back to the portfolio factor when the type has no bucket", async () => {
    exec
      .mockResolvedValueOnce({ rows: [] }) // type miss
      .mockResolvedValueOnce({ rows: [factorRow({ n_jobs: 9, factor: 0.96, realization_stdev: 0.10 })] }); // portfolio hit
    const r = await bidRealization(100000, "Obscure Type");
    expect(r!.basis).toBe("portfolio");
  });
});
