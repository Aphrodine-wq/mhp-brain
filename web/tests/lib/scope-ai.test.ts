import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/scope-ai";

describe("parseCsv (ConstructionAI scope)", () => {
  it("parses division|description|quantity rows into descriptions + qtyByCanon", () => {
    const csv = [
      "division|description|quantity|unit|unit_cost|total",
      "03 Concrete|Footings|12|cy|180|2160",
      "06 Wood|Kitchen Cabinets|24|lft|220|5280",
    ].join("\n");
    const out = parseCsv(csv);
    expect(out.descriptions).toEqual(["Footings", "Kitchen Cabinets"]);
    expect(out.qtyByCanon?.get("footings")).toBe(12);
    expect(out.qtyByCanon?.get("kitchen cabinets")).toBe(24);
  });

  it("skips the header, blank lines, and comments", () => {
    const csv = "division|description|quantity\n\n# a note\n01 General|Permits|1";
    const out = parseCsv(csv);
    expect(out.descriptions).toEqual(["Permits"]);
  });

  it("ignores rows with fewer than 2 columns", () => {
    const out = parseCsv("justonecolumn\n01|Real Line|3");
    expect(out.descriptions).toEqual(["Real Line"]);
  });

  it("omits qty when not a positive number", () => {
    const out = parseCsv("01|Allowance|TBD|ls");
    expect(out.descriptions).toEqual(["Allowance"]);
    expect(out.qtyByCanon).toBeUndefined();
  });
});
