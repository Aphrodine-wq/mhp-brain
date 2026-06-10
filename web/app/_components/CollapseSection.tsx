"use client";

import { useState } from "react";

// Collapsed-by-default dropdown shared by Estimates and Projects so both screens
// organize the same way. `forceOpen` (active filter) overrides the toggle — hiding
// rows the user just searched for would read as "no results". `nested` renders the
// flat sub-dropdown variant used for year groups inside a category.
export default function CollapseSection({
  title,
  summary,
  forceOpen = false,
  nested = false,
  children,
}: {
  title: string;
  summary: string;
  forceOpen?: boolean;
  nested?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;
  return (
    <div className={nested ? "csec-n" : "csec"}>
      <button className={`csec-h${isOpen ? " open" : ""}`} aria-expanded={isOpen} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
        <span className="csec-t">{title}</span>
        <small className="j">{summary}</small>
      </button>
      {isOpen && <div className="csec-body">{children}</div>}
    </div>
  );
}

// "2026" from a YYYY-MM-DD-ish string; rows without a usable date group separately
export const yearOf = (d: string) => (/^\d{4}/.test(d) ? d.slice(0, 4) : "No date");

// newest year first, "No date" pinned last
export function sortYears(years: string[]): string[] {
  return years.sort((a, b) => (a === "No date" ? 1 : b === "No date" ? -1 : b.localeCompare(a)));
}
