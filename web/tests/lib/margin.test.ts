import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));

import { projectMargin, marginBySegment } from "@/lib/margin";
import { db } from "@/lib/db";

const exec = db.execute as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe("projectMargin", () => {
  it("computes estimated margin and collection percentages", async () => {
    exec.mockImplementation((q: string | { sql: string }) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/FROM estimates/i.test(sql)) return Promise.resolve({ rows: [{ sum_sov_total: 100000, sum_item_total: 82000 }] });
      if (/FROM payments/i.test(sql)) return Promise.resolve({ rows: [{ t: 25000 }] });
      if (/FROM projects/i.test(sql)) return Promise.resolve({ rows: [{ contract_value: 100000 }] });
      return Promise.resolve({ rows: [] });
    });
    const m = await projectMargin("p1");
    expect(m.bid).toBe(100000);
    expect(m.estimatedCost).toBe(82000);
    expect(m.marginDollars).toBe(18000);
    expect(m.marginPct).toBeCloseTo(0.18, 5);
    expect(m.collected).toBe(25000);
    expect(m.collectedPct).toBeCloseTo(0.25, 5);
  });

  it("returns null margin when there's no parsed estimate", async () => {
    exec.mockImplementation((q: string | { sql: string }) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/FROM payments/i.test(sql)) return Promise.resolve({ rows: [{ t: 5000 }] });
      return Promise.resolve({ rows: [] });
    });
    const m = await projectMargin("p1");
    expect(m.bid).toBeNull();
    expect(m.estimatedCost).toBeNull();
    expect(m.marginDollars).toBeNull();
    expect(m.collected).toBe(5000);
  });

  it("treats a zero estimated cost as unknown (no fake 100% margin)", async () => {
    exec.mockImplementation((q: string | { sql: string }) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/FROM estimates/i.test(sql)) return Promise.resolve({ rows: [{ sum_sov_total: 50000, sum_item_total: 0 }] });
      return Promise.resolve({ rows: [] });
    });
    const m = await projectMargin("p1");
    expect(m.bid).toBe(50000);
    expect(m.estimatedCost).toBeNull();
    expect(m.marginDollars).toBeNull();
  });
});

describe("marginBySegment", () => {
  it("collapses to the latest estimate per project and groups by type & market", async () => {
    exec.mockResolvedValue({ rows: [
      { project_id: "a", sov: 100000, item: 80000, date: "2026-01", type: "Kitchen", market: "Oxford" },
      { project_id: "a", sov: 120000, item: 90000, date: "2026-02", type: "Kitchen", market: "Oxford" }, // latest for a
      { project_id: "b", sov: 50000, item: 40000, date: "2026-01", type: "Bath", market: "Tupelo" },
    ] });
    const r = await marginBySegment();
    expect(r.portfolioBid).toBe(170000); // 120k (latest a) + 50k (b)
    expect(r.portfolioCost).toBe(130000);
    expect(r.portfolioMarginPct).toBeCloseTo(40000 / 170000, 5);

    expect(r.byType[0].label).toBe("Kitchen"); // sorted by margin $ desc
    expect(r.byType[0].marginDollars).toBe(30000);
    expect(r.byType.find((s) => s.label === "Bath")?.marginDollars).toBe(10000);
    expect(r.byMarket.map((s) => s.label).sort()).toEqual(["Oxford", "Tupelo"]);
  });

  it("handles no estimates gracefully", async () => {
    exec.mockResolvedValue({ rows: [] });
    const r = await marginBySegment();
    expect(r.portfolioBid).toBe(0);
    expect(r.byType).toEqual([]);
    expect(r.portfolioMarginPct).toBeNull();
  });
});
