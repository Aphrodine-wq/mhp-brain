"use client";

import { useState } from "react";

export type SegTab = { key: string; label: string; content: React.ReactNode };

// iOS-style segmented control. Sections are rendered server-side and passed in as props —
// switching tabs is pure client state, no re-fetch.
export default function SegmentedTabs({ tabs }: { tabs: SegTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="seg-wrap">
      <div className="seg" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === active}
            className={`seg-btn${t.key === active ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="seg-panel" role="tabpanel">
        {current?.content}
      </div>
    </div>
  );
}
