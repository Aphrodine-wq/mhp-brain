// Per-role navigation and home screen configuration.
// Each role sees a different sidebar and lands on a different default page.

import type { Role } from "./auth";

export interface NavItem {
  href: string;
  label: string;
}

// What each role sees in the sidebar (admin sees everything).
const ROLE_NAV: Record<Role, NavItem[]> = {
  ceo: [
    { href: "/", label: "Cockpit" },
    { href: "/projects", label: "Projects" },
    { href: "/live", label: "Live" },
    { href: "/field/daily", label: "Daily Logs" },
  ],
  field: [
    { href: "/field", label: "Field Log" },
    { href: "/field/daily", label: "Daily Log Call" },
    { href: "/projects", label: "Projects" },
    { href: "/subs", label: "Subs" },
    { href: "/crew", label: "Crew" },
  ],
  estimator: [
    { href: "/estimate-builder", label: "Estimate Builder" },
    { href: "/estimates", label: "Estimates" },
    { href: "/projects", label: "Projects" },
    { href: "/subs", label: "Subs" },
  ],
  sales: [
    { href: "/", label: "Pipeline" },
    { href: "/projects", label: "Projects" },
    { href: "/estimates", label: "Estimates" },
  ],
  materials: [
    { href: "/", label: "Pricing" },
    { href: "/subs", label: "Vendors & Subs" },
    { href: "/estimates", label: "Estimates" },
  ],
  admin: [
    { href: "/", label: "Home" },
    { href: "/estimate-builder", label: "Estimate Builder" },
    { href: "/estimates", label: "Estimates" },
    { href: "/projects", label: "Projects" },
    { href: "/live", label: "Live" },
    { href: "/subs", label: "Subs" },
    { href: "/crew", label: "Crew" },
    { href: "/field", label: "Field Log" },
    { href: "/field/daily", label: "Daily Log Call" },
  ],
  editor: [
    { href: "/", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/estimates", label: "Estimates" },
    { href: "/field", label: "Field Log" },
  ],
  viewer: [
    { href: "/", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/estimates", label: "Estimates" },
  ],
};

export function navForRole(role: Role): NavItem[] {
  return ROLE_NAV[role] ?? ROLE_NAV.viewer;
}

// Human-readable role labels for the UI.
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  ceo: "CEO",
  field: "Field / Super",
  estimator: "Estimator",
  sales: "Sales",
  materials: "Materials",
  editor: "Editor",
  viewer: "Viewer",
};

// Which home screen component to render per role.
export type DashboardType = "ceo" | "field" | "estimator" | "sales" | "materials" | "default";

export function dashboardForRole(role: Role): DashboardType {
  switch (role) {
    case "ceo": return "ceo";
    case "field": return "field";
    case "estimator": return "estimator";
    case "sales": return "sales";
    case "materials": return "materials";
    default: return "default";
  }
}
