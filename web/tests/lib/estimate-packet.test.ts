import { describe, it, expect } from "vitest";
import { groupByDivision } from "@/lib/pdf/mhp-styles";
import type { EstimateLineItem } from "@/lib/pdf/types";
import { classifyFinish, groupFinishSelections } from "@/lib/documents";

// A line set spanning standard CSI divisions the catalog actually uses — including
// the ones the old Bandominium map mislabeled (9) or dropped (22/23/26/31).
function line(division: string, itemNo: number, description: string, qty: number, rate: number): EstimateLineItem {
  return {
    id: `${itemNo}`,
    estimate_id: "e1",
    line_number: itemNo,
    category: division,
    description,
    quantity: qty,
    unit: "ea",
    unit_price: rate,
    extended_price: qty * rate,
    material_cost: null,
    labor_cost: null,
    retail_price: null,
    notes: null,
    product_id: null,
    price_source: null,
    price_date: null,
    created_at: "",
  };
}

const LINES: EstimateLineItem[] = [
  line("Division 9: Finishes", 9.11, "LVT Flooring - Materials", 1500, 4),
  line("Division 3: Concrete", 3.31, "Slab Material", 30, 165),
  line("Division 26: Electrical", 26.1, "Electrical Material", 2400, 3),
  line("Division 6: Wood, Plastics, Composites", 6.11, "Framing Material", 2400, 6.5),
  line("Division 22: Plumbing", 22.1, "Plumbing Fixtures", 3, 900),
  line("Division 9: Finishes", 9.21, "Interior Paint Material", 2400, 1.2),
  line("Division 23: HVAC", 23.1, "HVAC Material", 3, 4200),
  line("Division 31: Earthwork", 31.1, "Construction Staking", 2840, 0.3),
];

describe("groupByDivision (PDF) — groups by the real CSI division", () => {
  const groups = groupByDivision(LINES);

  it("emits divisions in CSI numeric order, none dropped", () => {
    expect(groups.map((g) => g.divisionNumber)).toEqual(["3", "6", "9", "22", "23", "26", "31"]);
  });

  it("uses the real division name — DIV 9 is Finishes, not the old 'Cabinetry'", () => {
    const div9 = groups.find((g) => g.divisionNumber === "9")!;
    expect(div9.divisionName).toBe("Finishes");
  });

  it("keeps high-number divisions the old floored-line-number map dropped", () => {
    const names = Object.fromEntries(groups.map((g) => [g.divisionNumber, g.divisionName]));
    expect(names["22"]).toBe("Plumbing");
    expect(names["23"]).toBe("HVAC");
    expect(names["26"]).toBe("Electrical");
    expect(names["31"]).toBe("Earthwork");
  });

  it("collapses same-division lines into one group and sums them", () => {
    const div9 = groups.find((g) => g.divisionNumber === "9")!;
    expect(div9.items).toHaveLength(2); // flooring + paint
    expect(div9.total).toBe(1500 * 4 + 2400 * 1.2);
  });
});

describe("classifyFinish — client-selectable finishes only", () => {
  it("maps catalog finish lines onto selection categories", () => {
    expect(classifyFinish("LVT Flooring - Materials")).toBe("Flooring");
    expect(classifyFinish("Kitchen Cabinets")).toBe("Cabinetry");
    expect(classifyFinish("Countertop Material")).toBe("Countertops & Backsplash");
    expect(classifyFinish("Plumbing Fixtures")).toBe("Plumbing Fixtures");
    expect(classifyFinish("Appliances")).toBe("Appliances");
  });

  it("ignores labor and structural lines (not client selections)", () => {
    expect(classifyFinish("Countertop Labor")).toBeNull();
    expect(classifyFinish("Framing Material")).toBeNull();
    expect(classifyFinish("Slab Material")).toBeNull();
  });
});

describe("groupFinishSelections — Schedule A", () => {
  const groups = groupFinishSelections(LINES, (l) => l.description, (l) => l.extended_price ?? 0);

  it("surfaces only the finish lines, grouped by category", () => {
    const cats = groups.map((g) => g.category);
    expect(cats).toContain("Flooring");
    expect(cats).toContain("Plumbing Fixtures");
    expect(cats).toContain("Interior Paint & Color");
    expect(cats).not.toContain(undefined);
  });

  it("excludes structural/labor lines from the schedule", () => {
    const allItems = groups.flatMap((g) => g.items.map((i) => i.description));
    expect(allItems).not.toContain("Framing Material");
    expect(allItems).not.toContain("Slab Material");
    expect(allItems).not.toContain("HVAC Material");
  });

  it("carries the budgeted amount for each finish", () => {
    const flooring = groups.find((g) => g.category === "Flooring")!;
    expect(flooring.total).toBe(1500 * 4);
  });
});
