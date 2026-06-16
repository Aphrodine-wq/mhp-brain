import { describe, it, expect } from "vitest";
import { money, initials, BADGE } from "@/lib/format";

describe("money", () => {
  it("formats with thousands separators and no cents", () => {
    expect(money(284000)).toBe("$284,000");
    expect(money(1234.89)).toBe("$1,235"); // rounds
  });
  it("treats null/undefined as 0", () => {
    expect(money(null)).toBe("$0");
    expect(money(undefined)).toBe("$0");
  });
  it("handles negatives", () => {
    expect(money(-500)).toBe("$-500");
  });
});

describe("initials", () => {
  it("takes first letters of capitalized words, max 2", () => {
    expect(initials("Josh Harris")).toBe("JH");
    expect(initials("North Mississippi Home Pros")).toBe("NM");
  });
  it("skips lowercase-led words", () => {
    expect(initials("de la Cruz")).toBe("C");
  });
});

describe("BADGE", () => {
  it("maps the known statuses", () => {
    for (const k of ["Active", "Aging", "Bid", "Paused", "Dead", "Unknown"]) {
      expect(BADGE[k]).toBeTruthy();
    }
  });
});
