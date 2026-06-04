"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: (<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>) },
  { href: "/estimates", label: "Estimates", icon: (<><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>) },
  { href: "/projects", label: "Projects", icon: (<path d="M3 7h6l2 2h10v11H3z" />) },
  { href: "/live", label: "Live", icon: (<path d="M3 12h4l2-6 4 14 3-9 2 3h3" />) },
  { href: "/margin", label: "Margin", icon: (<><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>) },
  { href: "/subs", label: "Subs", icon: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 010 6M21 20c0-2.5-2-4-4-4.5" /></>) },
  { href: "/crew", label: "Crew", icon: (<><path d="M4 20a8 8 0 0116 0" /><circle cx="12" cy="7" r="4" /></>) },
];

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: (<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z" /></>),
};

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const link = ({ href, label, icon }: NavItem) => (
    <Link key={href} href={href} className={`nav${isActive(href) ? " active" : ""}`}>
      <svg viewBox="0 0 24 24">{icon}</svg>
      {label}
    </Link>
  );

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
        {link(SETTINGS)}
      </nav>
      <Link href="/settings" className="profile">
        <div className="avatar">WB</div>
        <div className="pmeta">
          <div className="pname">Walt Burge</div>
          <div className="prole">Senior Project Coordinator</div>
        </div>
      </Link>
    </aside>
  );
}
