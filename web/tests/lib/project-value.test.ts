import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn(), transaction: vi.fn() } }));

import { projectValue } from "@/lib/queries";

// The estimate id is a TEXT slug, not a number. It was being coerced with Number() before being
// compared, which made every tie `NaN > NaN` — false — so the reduce kept whichever row the DB
// returned first. The real vet-clinic rows below are the case that surfaced it: four estimates
// dated 2024-06-26, one of them a small cost-plus side estimate. Row order decided the headline
// bid, and it disagreed with margin.ts (which orders by `id DESC` in SQL) on the same project.
const VET_CLINIC = [
  { id: "nmhp-vet-project-estimate-june-5-2024-xlsx", date: "2024-06-05", sov: 1591794.79 },
  { id: "rdb-working-folder-nmhp-vet-project-estimate-june-18-2024-rdb-working-xlsx", date: "2024-06-18", sov: 1504686.96 },
  { id: "rdb-working-folder-nmhp-vet-project-estimate-june-26-2024-fixed-cost-item-e5beeb", date: "2024-06-26", sov: 1498480.07 },
  { id: "rdb-working-folder-nmhp-vet-project-estimate-june-26-2024-fixed-cost-items-xlsx", date: "2024-06-26", sov: 1498480.07 },
  { id: "nmhp-vet-project-estimate-june-26-2024-fixed-cost-items-fv-xlsx", date: "2024-06-26", sov: 1498177.37 },
  { id: "rdb-working-folder-nmhp-vet-project-estimate-cost-plus-18-june-26-2024-xlsx", date: "2024-06-26", sov: 255776.65 },
];

// margin.ts: ORDER BY est_date DESC NULLS LAST, id DESC LIMIT 1
function marginPick(rows: typeof VET_CLINIC): number {
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))[0].sov;
}

describe("projectValue", () => {
  it("takes the latest-dated estimate, not the largest", () => {
    expect(
      projectValue([
        { id: "a", date: "2024-01-01", sov: 900000 },
        { id: "b", date: "2025-06-01", sov: 120000 },
      ]),
    ).toBe(120000);
  });

  it("breaks a same-date tie on the id string, highest wins", () => {
    const v = projectValue([
      { id: "aaa", date: "2026-02-02", sov: 111 },
      { id: "zzz", date: "2026-02-02", sov: 222 },
    ]);
    expect(v).toBe(222);
  });

  it("is independent of row order (the NaN-tiebreak regression)", () => {
    const forward = projectValue(VET_CLINIC);
    const reversed = projectValue([...VET_CLINIC].reverse());
    expect(forward).toBe(reversed);
    // and specifically NOT the cost-plus side estimate that row order used to surface
    expect(forward).not.toBe(255776.65);
  });

  it("agrees with the estimate margin.ts computes against", () => {
    expect(projectValue(VET_CLINIC)).toBe(marginPick(VET_CLINIC));
    expect(projectValue(VET_CLINIC)).toBe(1498480.07);
  });

  it("falls back to the largest when nothing is dated", () => {
    expect(
      projectValue([
        { id: "a", date: "", sov: 500 },
        { id: "b", date: "", sov: 1500 },
      ]),
    ).toBe(1500);
  });

  it("ignores zero and null totals", () => {
    expect(projectValue([{ id: "a", date: "2026-01-01", sov: 0 }, { id: "b", date: "", sov: null }])).toBe(0);
  });
});
