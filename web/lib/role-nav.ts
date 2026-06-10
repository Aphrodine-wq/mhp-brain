// Per-role navigation and home screen configuration.
// Each role sees a different sidebar and lands on a different default page.

import type { Role } from "./auth";

export interface NavItem {
  href: string;
  label: string;
}

// What each role sees in the sidebar (admin sees everything).
const ROLE_NAV: Record<Role, NavItem[]> = {
  // CEO sees the full admin surface; only the landing differs (Cockpit, not Home).
  ceo: [
    { href: "/", label: "Cockpit" },
    { href: "/estimate-builder", label: "Estimate Builder" },
    { href: "/estimates", label: "Estimates" },
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
    { href: "/subs", label: "Subs" },
    { href: "/crew", label: "Crew" },
  ],
  editor: [
    { href: "/", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/estimates", label: "Estimates" },
  ],
  viewer: [
    { href: "/", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/estimates", label: "Estimates" },
  ],
  crew: [
    { href: "/", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/crew", label: "Crew" },
  ],
};

export function navForRole(role: Role): NavItem[] {
  return ROLE_NAV[role] ?? ROLE_NAV.viewer;
}

// Human-readable role labels for the UI.
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  ceo: "CEO",
  estimator: "Estimator",
  sales: "Sales",
  materials: "Materials",
  editor: "Editor",
  viewer: "Viewer",
  crew: "Crew",
};

// Which home screen component to render per role.
export type DashboardType = "ceo" | "estimator" | "sales" | "materials" | "default";

export function dashboardForRole(role: Role): DashboardType {
  switch (role) {
    case "ceo": return "ceo";
    case "estimator": return "estimator";
    case "sales": return "sales";
    case "materials": return "materials";
    default: return "default";
  }
}
