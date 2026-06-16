import { describe, it, expect } from "vitest";
import { parseJobText, qtyFor } from "@/lib/parse-job";

describe("parseJobText", () => {
  it("always seeds general conditions + coordination", () => {
    const { descriptions } = parseJobText("");
    expect(descriptions).toContain("General Conditions");
    expect(descriptions).toContain("Project Coordination (Supervision)");
  });

  it("maps keywords to catalog descriptions", () => {
    const { descriptions } = parseJobText("new kitchen cabinets with quartz countertops and fresh paint");
    expect(descriptions).toContain("Kitchen Cabinets");
    expect(descriptions).toContain("Countertop Material");
    expect(descriptions).toContain("Interior Paint Material");
  });

  it("detects square footage and linear feet", () => {
    const a = parseJobText("remodel approx 850 sqft");
    expect(a.detected.sqft).toBe(850);
    const b = parseJobText("install 42 lft of cabinets");
    expect(b.detected.lft).toBe(42);
  });

  it("does not duplicate a description", () => {
    const { descriptions } = parseJobText("counter quartz granite countertop");
    expect(descriptions.filter((d) => d === "Countertop Material").length).toBe(1);
  });
});

describe("qtyFor", () => {
  const detected = { sqft: 850, lft: 42 };
  it("seeds 1 for the always-present lines", () => {
    expect(qtyFor("lump", "General Conditions", detected)).toBe(1);
  });
  it("seeds sqft/lft from detected", () => {
    expect(qtyFor("sqft", "LVT Flooring - Materials", detected)).toBe(850);
    expect(qtyFor("lft", "Kitchen Cabinets", detected)).toBe(42);
  });
  it("returns null for units the estimator must fill", () => {
    expect(qtyFor("each", "Interior Doors", detected)).toBeNull();
  });
});
