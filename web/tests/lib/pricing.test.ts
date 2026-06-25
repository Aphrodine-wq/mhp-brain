import { describe, it, expect, vi, beforeEach } from "vitest";

// buildLines attaches catalog rates to descriptions. Mock the catalog so we can pin the
// precedence rule (unit vs lump) and the missing-line fallback — the heart of the pricing engine.
vi.mock("@/lib/catalog", () => ({ loadCatalog: vi.fn() }));

import { buildLines } from "@/lib/pricing";
import { loadCatalog } from "@/lib/catalog";
import { canon } from "@/lib/canon";

const load = loadCatalog as ReturnType<typeof vi.fn>;

function catalog(opts: { unit?: [string, Record<string, unknown>][]; lump?: [string, Record<string, unknown>][] }) {
  const unit = new Map((opts.unit ?? []).map(([d, v]) => [canon(d), v]));
  const lump = new Map((opts.lump ?? []).map(([d, v]) => [canon(d), v]));
  load.mockResolvedValue({ unit, lump });
}

const DET = { sqft: null, lft: null };

beforeEach(() => vi.clearAllMocks());

describe("buildLines — catalog attach + precedence", () => {
  it("attaches a unit rate when only a unit entry exists", async () => {
    catalog({ unit: [["Framing Labor", { unit: "sqft", median: 7.25, division: "Div 6", item_no: "06", jobs: 12, p25: 6.5, p75: 8.1 }]] });
    const [l] = await buildLines(["Framing Labor"], DET);
    expect(l.kind).toBe("unit");
    expect(l.rate).toBe(7.25);
    expect(l.unit).toBe("sqft");
    expect(l.jobs).toBe(12);
    expect(l.p25).toBe(6.5);
  });

  it("attaches a lump rate when only a lump entry exists", async () => {
    catalog({ lump: [["Kitchen Cabinets", { median: 38500, division: "Div 12", item_no: "12", jobs: 62, p25: 30000, p75: 42000 }]] });
    const [l] = await buildLines(["Kitchen Cabinets"], DET);
    expect(l.kind).toBe("lump");
    expect(l.unit).toBe("lump");
    expect(l.rate).toBe(38500);
  });

  it("prefers the better-backed source when an item is both unit and lump (more jobs wins)", async () => {
    // lump has more jobs → lump wins (the $2,350 62-job lump beats a thin per-each allowance)
    catalog({
      unit: [["Plumbing Fixtures", { unit: "each", median: 175, jobs: 4, p25: null, p75: null, division: "", item_no: "" }]],
      lump: [["Plumbing Fixtures", { median: 2350, jobs: 62, p25: null, p75: null, division: "", item_no: "" }]],
    });
    const [l] = await buildLines(["Plumbing Fixtures"], DET);
    expect(l.kind).toBe("lump");
    expect(l.rate).toBe(2350);
  });

  it("prefers the unit rate on a tie or when unit has more jobs", async () => {
    catalog({
      unit: [["Trim", { unit: "lft", median: 3.5, jobs: 20, p25: null, p75: null, division: "", item_no: "" }]],
      lump: [["Trim", { median: 900, jobs: 20, p25: null, p75: null, division: "", item_no: "" }]],
    });
    const [l] = await buildLines(["Trim"], DET);
    expect(l.kind).toBe("unit"); // u.jobs >= l.jobs → unit
    expect(l.rate).toBe(3.5);
  });

  it("marks an unknown description as 'missing' with null qty/rate", async () => {
    catalog({});
    const [l] = await buildLines(["Some Bespoke Thing"], DET);
    expect(l.kind).toBe("missing");
    expect(l.qty).toBeNull();
    expect(l.rate).toBeNull();
    expect(l.unit).toBe("?");
  });

  it("an explicit qtyByCanon overrides the unit-derived quantity", async () => {
    catalog({ unit: [["Framing Labor", { unit: "sqft", median: 7.25, jobs: 12, p25: null, p75: null, division: "", item_no: "" }]] });
    const byCanon = new Map([[canon("Framing Labor"), 1840]]);
    const [l] = await buildLines(["Framing Labor"], DET, byCanon);
    expect(l.qty).toBe(1840);
  });

  it("seeds sqft-based qty from detected dimensions when no override is given", async () => {
    catalog({ unit: [["Framing Labor", { unit: "sqft", median: 7.25, jobs: 12, p25: null, p75: null, division: "", item_no: "" }]] });
    const [l] = await buildLines(["Framing Labor"], { sqft: 2000, lft: null });
    expect(l.qty).toBe(2000); // qtyFor maps a sqft unit to detected.sqft
  });
});
