"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  House, FileText, Folder, Users, UserCircle, PlugsConnected, Gear,
  ChartLine, Tag, Crosshair, List, CaretLeft,
} from "@phosphor-icons/react";
import type { SessionUser, Role } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode };

// Icon library (Phosphor) — shared across role configs
const ICONS: Record<string, React.ReactNode> = {
  home: <House size={18} />,
  estimator: <FileText size={18} />,
  estimates: <FileText size={18} />,
  projects: <Folder size={18} />,
  subs: <Users size={18} />,
  crew: <UserCircle size={18} />,
  integrations: <PlugsConnected size={18} />,
  settings: <Gear size={18} />,
  pipeline: <ChartLine size={18} />,
  pricing: <Tag size={18} />,
  radar: <Crosshair size={18} />,
};

function i(name: string): React.ReactNode { return ICONS[name] ?? ICONS.home; }

// Per-role nav configuration
const ROLE_NAV: Record<Role, NavItem[]> = {
  // CEO sees the full admin surface; only the landing differs (Cockpit, not Home).
  ceo: [
    { href: "/", label: "Cockpit", icon: i("home") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/crew", label: "Crew", icon: i("crew") },
    { href: "/pricing", label: "Pricing", icon: i("pricing") },
  ],
  estimator: [
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
  ],
  sales: [
    { href: "/", label: "Pipeline", icon: i("pipeline") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
  ],
  materials: [
    { href: "/", label: "Pricing", icon: i("pricing") },
    { href: "/subs", label: "Vendors & Subs", icon: i("subs") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
  ],
  admin: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/crew", label: "Crew", icon: i("crew") },
    { href: "/pricing", label: "Pricing", icon: i("pricing") },
  ],
  editor: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
  ],
  viewer: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
  ],
  crew: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/crew", label: "Crew", icon: i("crew") },
  ],
};

const ROLE_FOOTER: Record<string, NavItem[]> = {
  admin: [
    { href: "/integrations", label: "Integrations", icon: i("integrations") },
    { href: "/settings", label: "Settings", icon: i("settings") },
  ],
  ceo: [
    { href: "/integrations", label: "Integrations", icon: i("integrations") },
    { href: "/settings", label: "Settings", icon: i("settings") },
  ],
  default: [
    { href: "/settings", label: "Settings", icon: i("settings") },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  ceo: "CEO",
  estimator: "Estimator",
  sales: "Sales",
  materials: "Materials",
  editor: "Editor",
  viewer: "Viewer",
  crew: "Crew",
};

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  // Drawer state — only matters on mobile, where the sidebar slides in over the content.
  const [open, setOpen] = useState(false);
  // Collapsed rail — desktop only. Persisted so it survives navigation/reloads.
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Lock body scroll while the drawer is open (mobile). Closing on navigation is
  // handled per-link via onClick so we don't have to setState from an effect.
  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  // Hydrate collapsed state from localStorage after mount (avoids SSR mismatch).
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration has no render-time equivalent under SSR */
  useEffect(() => {
    setCollapsed(localStorage.getItem("mhp.sidebar.collapsed") === "1");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("mhp.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  };

  const nav = ROLE_NAV[user.role] ?? ROLE_NAV.viewer;
  const foot = ROLE_FOOTER[user.role] ?? ROLE_FOOTER.default;

  const link = ({ href, label, icon }: NavItem) => (
    <Link
      key={href}
      href={href}
      className={`nav${isActive(href) ? " active" : ""}`}
      onClick={() => setOpen(false)}
      title={collapsed ? label : undefined}
    >
      {icon}
      <span className="nav-label">{label}</span>
    </Link>
  );

  const initials =
    user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const roleLabel = ROLE_LABEL[user.role] + (user.scope ? ` · ${user.scope}` : "");

  return (
    <>
      {/* Mobile-only top bar — hidden on desktop via CSS. Hosts the hamburger. */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
          <List size={22} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="MHP" />
      </header>

      {/* Backdrop behind the open drawer */}
      <div className={`scrim${open ? " show" : ""}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar${open ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="MHP" />
      </div>
      <nav>
        {nav.map(link)}
        <div className="nav-sep" />
        {foot.map(link)}
      </nav>
      <div className="collapse-row">
        <button
          className="collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CaretLeft size={18} />
        </button>
      </div>
      <div className="profile-row">
        <Link href="/settings" className="profile" onClick={() => setOpen(false)}>
          <div className="avatar">{initials}</div>
          <div className="pmeta">
            <div className="pname">{user.name}</div>
            <div className="prole">{roleLabel}</div>
          </div>
        </Link>
      </div>
      </aside>
    </>
  );
}
