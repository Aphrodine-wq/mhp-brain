"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";

// Sign-out lives here (Settings) instead of the sidebar — it's a rare action,
// not something to put in front of the crew every day.
export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="btn ghost sm" onClick={logout} disabled={busy}>
      <SignOut size={14} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
