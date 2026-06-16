import { describe, it, expect } from "vitest";
import { dashboardForRole, navForRole, ROLE_LABELS } from "@/lib/role-nav";

const ROLES = ["admin", "ceo", "estimator", "sales", "materials", "editor", "viewer", "crew"] as const;

describe("dashboardForRole", () => {
  it("routes the special roles to their own dashboard", () => {
    expect(dashboardForRole("ceo")).toBe("ceo");
    expect(dashboardForRole("sales")).toBe("sales");
    expect(dashboardForRole("estimator")).toBe("estimator");
    expect(dashboardForRole("materials")).toBe("materials");
  });
  it("routes everyone else to the default dashboard", () => {
    expect(dashboardForRole("admin")).toBe("default");
    expect(dashboardForRole("editor")).toBe("default");
    expect(dashboardForRole("viewer")).toBe("default");
    expect(dashboardForRole("crew")).toBe("default");
  });
});

describe("navForRole / ROLE_LABELS", () => {
  it("every role has a non-empty nav and a label", () => {
    for (const r of ROLES) {
      expect(navForRole(r).length).toBeGreaterThan(0);
      expect(ROLE_LABELS[r]).toBeTruthy();
    }
  });
});
