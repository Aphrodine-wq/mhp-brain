"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser, Role } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode };

// Icon library — shared across role configs
const ICONS: Record<string, React.ReactNode> = {
  home: (<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  estimator: (<><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h6" /></>),
  estimates: (<><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>),
  projects: (<path d="M3 7h6l2 2h10v11H3z" />),
  subs: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 010 6M21 20c0-2.5-2-4-4-4.5" /></>),
  crew: (<><path d="M4 20a8 8 0 0116 0" /><circle cx="12" cy="7" r="4" /></>),
  documents: (<><path d="M8 3h8l4 4v14H8z" /><path d="M16 3v4h4" /><path d="M4 7v14h11" /></>),
  integrations: (<><path d="M9 17H7A5 5 0 017 7h2" /><path d="M15 7h2a5 5 0 010 10h-2" /><path d="M8 12h8" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z" /></>),
  pipeline: (<><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>),
  pricing: (<><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>),
  time: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  radar: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 12l6-4" /></>),
  trello: (<><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="3.5" height="10" rx="1" /><rect x="13.5" y="7" width="3.5" height="6" rx="1" /></>),
};

function i(name: string): React.ReactNode { return ICONS[name] ?? ICONS.home; }

// Per-role nav configuration
const ROLE_NAV: Record<Role, NavItem[]> = {
  // CEO sees the full admin surface; only the landing differs (Cockpit, not Home).
  ceo: [
    { href: "/", label: "Cockpit", icon: i("home") },
    { href: "/estimate-builder", label: "Estimate Builder", icon: i("estimator") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/crew", label: "Crew", icon: i("crew") },
    { href: "/documents", label: "Documents", icon: i("documents") },
    { href: "/pricing", label: "Pricing", icon: i("pricing") },
    { href: "/time", label: "Time", icon: i("time") },
    { href: "/trello", label: "Trello", icon: i("trello") },
  ],
  estimator: [
    { href: "/estimate-builder", label: "Estimate Builder", icon: i("estimator") },
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
    { href: "/estimate-builder", label: "Estimate Builder", icon: i("estimator") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/subs", label: "Subs", icon: i("subs") },
    { href: "/crew", label: "Crew", icon: i("crew") },
    { href: "/documents", label: "Documents", icon: i("documents") },
    { href: "/pricing", label: "Pricing", icon: i("pricing") },
    { href: "/time", label: "Time", icon: i("time") },
    { href: "/trello", label: "Trello", icon: i("trello") },
  ],
  editor: [
    { href: "/", label: "Home", icon: i("home") },
    { href: "/projects", label: "Projects", icon: i("projects") },
    { href: "/estimates", label: "Estimates", icon: i("estimates") },
    { href: "/time", label: "Time", icon: i("time") },
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
  const router = useRouter();
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
      <svg viewBox="0 0 24 24">{icon}</svg>
      <span className="nav-label">{label}</span>
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
        <a
          className="nav"
          href="mailto:jamesburge.mcm@gmail.com?subject=MHP%20Estimate%20%E2%80%94%20support%20request"
          onClick={() => setOpen(false)}
          title={collapsed ? "Support" : undefined}
        >
          <svg viewBox="0 0 24 24">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          <span className="nav-label">Support</span>
        </a>
      </nav>
      <div className="collapse-row">
        <button
          className="collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
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
