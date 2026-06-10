"use client";

import { useState } from "react";

// Collapsed-by-default category dropdown shared by Estimates and Projects so both
// screens organize the same way. `forceOpen` (active filter) overrides the toggle —
// hiding rows the user just searched for would read as "no results".
export default function CollapseSection({
  title,
  summary,
  forceOpen = false,
  children,
}: {
  title: string;
  summary: string;
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;
  return (
    <div className="csec">
      <button className={`csec-h${isOpen ? " open" : ""}`} aria-expanded={isOpen} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
        <span className="csec-t">{title}</span>
        <small className="j">{summary}</small>
      </button>
      {isOpen && <div className="csec-body">{children}</div>}
    </div>
  );
}
