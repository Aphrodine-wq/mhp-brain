import { describe, it, expect } from "vitest";
import { canon, normUnit } from "@/lib/canon";

// canon/normUnit must mirror the Python pipeline (normalize.py) exactly — catalog lookups and
// override keys depend on it. These lock that contract.
describe("canon", () => {
  it("collapses whitespace, trims, lowercases", () => {
    expect(canon("  Kitchen   Cabinets ")).toBe("kitchen cabinets");
    expect(canon("LVT Flooring")).toBe("lvt flooring");
  });
  it("handles null/undefined", () => {
    expect(canon(null)).toBe("");
    expect(canon(undefined)).toBe("");
  });
});

describe("normUnit", () => {
  it("maps aliases to canonical units", () => {
    expect(normUnit("SF")).toBe("sqft");
    expect(normUnit("sq ft")).toBe("sqft");
    expect(normUnit("LF")).toBe("lft");
    expect(normUnit("ea.")).toBe("each");
    expect(normUnit("cubic yard")).toBe("cy");
  });
  it("strips a leading 'per' for unknown units", () => {
    expect(normUnit("per door")).toBe("door");
  });
  it("returns null for empty", () => {
    expect(normUnit(null)).toBeNull();
    expect(normUnit("")).toBeNull();
  });
});
