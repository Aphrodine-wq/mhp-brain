"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Couldn't reset your password. Try again.");
        setBusy(false);
        return;
      }
      setDone(true);
      // Brief confirmation, then back to sign in with the new password.
      setTimeout(() => router.replace("/login"), 1500);
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/logo.png" alt="MHP Construction" />
        <h1 className="login-title">Set a new password</h1>
        <p className="login-subtitle">Choose a password you don&apos;t use anywhere else</p>

        {done ? (
          <>
            <div className="login-ok">Password updated. Taking you to sign in…</div>
            <div className="login-alt">
              <Link href="/login">Sign in now</Link>
            </div>
          </>
        ) : (
          <>
            {error && <div className="login-err">{error}</div>}

            <form className="login-form" onSubmit={submit}>
              <label>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}

        <div className="login-footer">North Mississippi Home Professionals</div>
      </div>
    </div>
  );
}
