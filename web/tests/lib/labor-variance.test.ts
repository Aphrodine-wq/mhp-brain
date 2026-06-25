import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));

import { lineLaborDollars, estimatedLabor, laborVariance, COMBINED_LINE_LABOR_FRACTION } from "@/lib/labor-variance";
import { db } from "@/lib/db";

const exec = db.execute as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe("lineLaborDollars — classification (the Phase 2 decisions)", () => {
  it("clean labor line counts 100% of its total", () => {
    const r = lineLaborDollars({ description: "Framing Labor", qty: 10, rate: 50 });
    expect(r).toEqual({ labor: 500, combined: false });
  });

  it("combined Material & Labor line counts only the labor fraction", () => {
    const r = lineLaborDollars({ description: "Plumbing Material & Labor", qty: 1, rate: 2000 });
    expect(r.combined).toBe(true);
    expect(r.labor).toBeCloseTo(2000 * COMBINED_LINE_LABOR_FRACTION, 5);
  });

  it("treats parenthetical combined lines as combined", () => {
    const r = lineLaborDollars({ description: "Shower Door (Included Material & Labor)", qty: 1, rate: 1500 });
    expect(r.combined).toBe(true);
    expect(r.labor).toBeCloseTo(1500 * COMBINED_LINE_LABOR_FRACTION, 5);
  });

  it("non-labor (pure material) lines contribute zero", () => {
    expect(lineLaborDollars({ description: "Framing Material", qty: 100, rate: 8 })).toEqual({ labor: 0, combined: false });
  });

  it("does not match 'labor' embedded in another word (e.g. Laboratory)", () => {
    expect(lineLaborDollars({ description: "Laboratory Casework Material", qty: 1, rate: 900 }).labor).toBe(0);
  });

  it("coerces string qty/rate (lines come from JSONB)", () => {
    const r = lineLaborDollars({ description: "Electrical Labor", qty: "8", rate: "65" });
    expect(r.labor).toBe(520);
  });

  it("handles null qty/rate without NaN", () => {
    expect(lineLaborDollars({ description: "Paint Labor", qty: null, rate: null }).labor).toBe(0);
  });
});

function mockLines(lines: unknown[]) {
  exec.mockImplementation((q: string | { sql: string }) => {
    const sql = typeof q === "string" ? q : q.sql;
    if (/FROM saved_estimates/i.test(sql)) return Promise.resolve({ rows: [{ lines: JSON.stringify(lines) }] });
    return Promise.resolve({ rows: [] }); // qb_job_costs etc. — not present yet
  });
}

describe("estimatedLabor — sums labor across a saved estimate", () => {
  it("adds clean lines at 100% and combined lines at the fraction", async () => {
    mockLines([
      { description: "Framing Labor", qty: 10, rate: 50 }, // 500 clean
      { description: "Interior Paint Labor", qty: 1, rate: 1200 }, // 1200 clean
      { description: "Plumbing Material & Labor", qty: 1, rate: 2000 }, // 800 combined
      { description: "Framing Material", qty: 100, rate: 8 }, // 0
    ]);
    const e = await estimatedLabor("p1");
    expect(e.laborDollars).toBeCloseTo(500 + 1200 + 800, 5);
    expect(e.cleanLines).toBe(2);
    expect(e.combinedLines).toBe(1);
    expect(e.hasEstimate).toBe(true);
  });

  it("returns empty (no crash) when the project has no saved estimate", async () => {
    exec.mockResolvedValue({ rows: [] });
    const e = await estimatedLabor("p1");
    expect(e).toEqual({ laborDollars: 0, cleanLines: 0, combinedLines: 0, hasEstimate: false });
  });
});

describe("laborVariance — estimate live, actual awaits QuickBooks", () => {
  it("reports estimated labor and awaiting_quickbooks until the QB pipe lands", async () => {
    mockLines([{ description: "Framing Labor", qty: 10, rate: 50 }]);
    const v = await laborVariance("p1");
    expect(v.estimatedLabor).toBe(500);
    expect(v.actualLabor).toBeNull();
    expect(v.varianceDollars).toBeNull();
    expect(v.status).toBe("awaiting_quickbooks");
  });

  it("computes variance once actual labor cost is available from QB", async () => {
    exec.mockImplementation((q: string | { sql: string }) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/FROM saved_estimates/i.test(sql)) return Promise.resolve({ rows: [{ lines: JSON.stringify([{ description: "Framing Labor", qty: 10, rate: 50 }]) }] });
      if (/FROM qb_job_costs/i.test(sql)) return Promise.resolve({ rows: [{ labor_cost: 600 }] });
      return Promise.resolve({ rows: [] });
    });
    const v = await laborVariance("p1");
    expect(v.estimatedLabor).toBe(500);
    expect(v.actualLabor).toBe(600);
    expect(v.varianceDollars).toBe(100); // 100 over the bid
    expect(v.variancePct).toBeCloseTo(0.2, 5);
    expect(v.status).toBe("ready");
  });

  it("status is no_estimate when there is no labor to estimate", async () => {
    mockLines([{ description: "Framing Material", qty: 100, rate: 8 }]);
    const v = await laborVariance("p1");
    expect(v.estimatedLabor).toBeNull();
    expect(v.status).toBe("no_estimate");
  });
});
