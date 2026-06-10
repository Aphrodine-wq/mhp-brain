"use client";

import { useEffect } from "react";

// Applies the persisted appearance settings (Settings → Appearance) on every page load.
// Renders nothing; the body class is the whole job.
export default function AppearanceMode() {
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("mhp_settings") || "{}");
      document.body.classList.toggle("compact", s.compact === true);
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
