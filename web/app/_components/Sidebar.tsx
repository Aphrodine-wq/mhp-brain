"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: (<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>) },
  { href: "/estimate-builder", label: "Estimate Builder", icon: (<><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h6" /></>) },
  { href: "/estimates", label: "Estimates", icon: (<><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>) },
  { href: "/projects", label: "Projects", icon: (<path d="M3 7h6l2 2h10v11H3z" />) },
  { href: "/live", label: "Live", icon: (<path d="M3 12h4l2-6 4 14 3-9 2 3h3" />) },
  { href: "/subs", label: "Subs", icon: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 010 6M21 20c0-2.5-2-4-4-4.5" /></>) },
  { href: "/crew", label: "Crew", icon: (<><path d="M4 20a8 8 0 0116 0" /><circle cx="12" cy="7" r="4" /></>) },
  { href: "/field", label: "Field Log", icon: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></>) },
];

const FOOT: NavItem[] = [
  { href: "/integrations", label: "Integrations", icon: (<><path d="M9 17H7A5 5 0 017 7h2" /><path d="M15 7h2a5 5 0 010 10h-2" /><path d="M8 12h8" /></>) },
  { href: "/settings", label: "Settings", icon: (<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z" /></>) },
];

const ROLE_LABEL: Record<SessionUser["role"], string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const link = ({ href, label, icon }: NavItem) => (
    <Link key={href} href={href} className={`nav${isActive(href) ? " active" : ""}`}>
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
    <aside className="sidebar">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="MHP" />
        <span>Estimator</span>
      </div>
      <nav>
        {NAV.map(link)}
        <div className="nav-sep" />
        {FOOT.map(link)}
      </nav>
      <div className="profile-row">
        <Link href="/settings" className="profile">
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
  );
}
