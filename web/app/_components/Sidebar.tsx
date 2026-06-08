"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser, Role } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode };

// Icon library — shared across role configs
const ICONS: Record<string, React.ReactNode> = {
  home: (<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  requests: (<><path d="M4 4h16v12H7l-3 3z" /><path d="M8 9h8M8 12h5" /></>),
  estimator: (<><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h6" /></>),
  estimates: (<><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>),
  projects: (<path d="M3 7h6l2 2h10v11H3z" />),
  live: (<path d="M3 12h4l2-6 4 14 3-9 2 3h3" />),
  subs: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 010 6M21 20c0-2.5-2-4-4-4.5" /></>),
  crew: (<><path d="M4 20a8 8 0 0116 0" /><circle cx="12" cy="7" r="4" /></>),
  field: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></>),
  daily: (<><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></>),
  integrations: (<><path d="M9 17H7A5 5 0 017 7h2" /><path d="M15 7h2a5 5 0 010 10h-2" /><path d="M8 12h8" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z" /></>),
  pipeline: (<><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>),
  pricing: (<><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>),
};

function i(name: string): React.ReactNode { return ICONS[name] ?? ICONS.home; }

// Per-role nav configuration
const ROLE_NAV: Record<Role, NavItem[]> = {
  ceo: [
    { href: "/", label: "Cockpit", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/live", label: "Live", icon: i("live") },
    { href: "/field/daily", label: "Daily Logs", icon: i("daily") },
  ],
  field: [
    { href: "/", label: "My Jobs", icon: i("home") },
    { href: "/field", label: "Quick Log", icon: i("field") },
    { href: "/field/daily", label: "Daily Log Call", icon: i("daily") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/crew", label: "Crew", icon: i("crew") },
  ],
  estimator: [
    { href: "/requests", label: "Requests", icon: i("requests") },
    { href: "/estimate-builder", label: "Estimate Builder", icon: i("estimator") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/live", label: "Live", icon: i("live") },
  ],
  sales: [
    { href: "/", label: "Pipeline", icon: i("pipeline") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/field", label: "Log a Call", icon: i("field") },
  ],
  materials: [
    { href: "/", label: "Pricing", icon: i("pricing") },
    { href: "/subs", label: "Vendors & Subs", icon: i("subs") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
  ],
  admin: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/requests", label: "Requests", icon: i("requests") },
    { href: "/estimate-builder", label: "Estimate Builder", icon: i("estimator") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/live", label: "Live", icon: i("live") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/crew", label: "Crew", icon: i("crew") },
    { href: "/field", label: "Field Log", icon: i("field") },
    { href: "/field/daily", label: "Daily Log Call", icon: i("daily") },
  ],
  editor: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/field", label: "Field Log", icon: i("field") },
  ],
  viewer: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
  ],
};

const ROLE_FOOTER: Record<string, NavItem[]> = {
  admin: [
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
  field: "Field / Super",
  estimator: "Estimator",
  sales: "Sales",
  materials: "Materials",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_TITLE: Record<Role, string> = {
  admin: "MHP Brain",
  ceo: "MHP Cockpit",
  field: "MHP Field",
  estimator: "MHP Estimator",
  sales: "MHP Sales",
  materials: "MHP Materials",
  editor: "MHP Brain",
  viewer: "MHP Brain",
};

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  // Drawer state — only matters on mobile, where the sidebar slides in over the content.
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Lock body scroll while the drawer is open (mobile). Closing on navigation is
  // handled per-link via onClick so we don't have to setState from an effect.
  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  const nav = ROLE_NAV[user.role] ?? ROLE_NAV.viewer;
  const foot = ROLE_FOOTER[user.role] ?? ROLE_FOOTER.default;
  const title = ROLE_TITLE[user.role] ?? "MHP Brain";

  const link = ({ href, label, icon }: NavItem) => (
    <Link key={href} href={href} className={`nav${isActive(href) ? " active" : ""}`} onClick={() => setOpen(false)}>
      <svg viewBox="0 0 24 24">{icon}</svg>
      {label}
    </Link>
  );

  const initials =
    user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const roleLabel = ROLE_LABEL[user.role] + (user.scope ? ` · ${user.scope}` : "");

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile-only top bar — hidden on desktop via CSS. Hosts the hamburger. */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="MHP" />
        <span className="tb-title">{title}</span>
      </header>

      {/* Backdrop behind the open drawer */}
      <div className={`scrim${open ? " show" : ""}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="MHP" />
        <span>{title}</span>
      </div>
      <nav>
        {nav.map(link)}
        <div className="nav-sep" />
        {foot.map(link)}
      </nav>
      <div className="profile-row">
        <Link href="/settings" className="profile" onClick={() => setOpen(false)}>
          <div className="avatar">{initials}</div>
          <div className="pmeta">
            <div className="pname">{user.name}</div>
            <div className="prole">{roleLabel}</div>
          </div>
        </Link>
        <button className="logout" onClick={logout} title="Sign out" aria-label="Sign out">
          <svg viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
      </aside>
    </>
  );
}
