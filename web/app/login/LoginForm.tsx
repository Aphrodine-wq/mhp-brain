"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ next, dev }: { next: string; dev: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Sign-in failed");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  async function devLogin() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/dev-login", { method: "POST" });
      router.replace(next);
      router.refresh();
    } catch {
      setError("Dev login failed");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/logo.svg" alt="MHP" />
        <h1 className="login-brand">MHP Estimator</h1>
        <p className="login-sub">Sign in to continue.</p>
        {error && <div className="login-err">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {dev && (
          <button type="button" className="login-dev" onClick={devLogin} disabled={busy}>
            Dev sign-in (admin) · local only
          </button>
        )}
      </form>
    </div>
  );
}
