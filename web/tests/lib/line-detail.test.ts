import { describe, it, expect } from "vitest";
import {
  detailFor,
  divisionDetailFor,
  LINE_DETAIL,
  DIVISION_DETAIL,
  ESTIMATE_SCOPE,
} from "@/lib/line-detail";

// detailFor / divisionDetailFor are the lookup that attaches proposal-grade scope text to
// each estimate line and division. Keys are canon(text) — these lock the normalization so a
// line typed with odd casing/whitespace still resolves to its detail.
describe("detailFor", () => {
  it("resolves a known line item exactly", () => {
    expect(detailFor("Kitchen Cabinets")).toBe(LINE_DETAIL["kitchen cabinets"]);
    expect(detailFor("kitchen cabinets")).toBe(LINE_DETAIL["kitchen cabinets"]);
  });

  it("normalizes case and collapses whitespace before lookup", () => {
    expect(detailFor("  FRAMING   Material ")).toBe(LINE_DETAIL["framing material"]);
  });

  it("returns null for an unknown description", () => {
    expect(detailFor("imaginary line item")).toBeNull();
  });

  it("treats null / undefined / empty as no match", () => {
    expect(detailFor(null)).toBeNull();
    expect(detailFor(undefined)).toBeNull();
    expect(detailFor("")).toBeNull();
    expect(detailFor("   ")).toBeNull();
  });

  it("every LINE_DETAIL key round-trips through detailFor", () => {
    for (const key of Object.keys(LINE_DETAIL)) {
      expect(detailFor(key)).toBe(LINE_DETAIL[key]);
    }
  });
});

describe("divisionDetailFor", () => {
  it("matches on the trailing division name after the 'Division N:' prefix", () => {
    expect(divisionDetailFor("Division 9: Finishes")).toBe(DIVISION_DETAIL["finishes"]);
    expect(divisionDetailFor("Division 3: Concrete")).toBe(DIVISION_DETAIL["concrete"]);
  });

  it("matches a bare division name with no prefix", () => {
    expect(divisionDetailFor("Electrical")).toBe(DIVISION_DETAIL["electrical"]);
  });

  it("normalizes case and whitespace around the name", () => {
    expect(divisionDetailFor("Division 22:   PLUMBING ")).toBe(DIVISION_DETAIL["plumbing"]);
  });

  it("returns null for empty or unknown divisions", () => {
    expect(divisionDetailFor(null)).toBeNull();
    expect(divisionDetailFor(undefined)).toBeNull();
    expect(divisionDetailFor("")).toBeNull();
    expect(divisionDetailFor("Division 99: Nonexistent")).toBeNull();
  });
});

describe("ESTIMATE_SCOPE", () => {
  it("carries the four document-level sections, all non-empty", () => {
    for (const section of ["included", "excluded", "assumptions", "terms"] as const) {
      expect(Array.isArray(ESTIMATE_SCOPE[section])).toBe(true);
      expect(ESTIMATE_SCOPE[section].length).toBeGreaterThan(0);
      for (const line of ESTIMATE_SCOPE[section]) {
        expect(typeof line).toBe("string");
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});
