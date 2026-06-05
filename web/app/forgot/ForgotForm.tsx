"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      setDone(true);
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
        <h1 className="login-title">Reset password</h1>
        <p className="login-subtitle">We&apos;ll email you a link to set a new one</p>

        {done ? (
          <>
            <div className="login-ok">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. It&apos;s
              good for 1 hour. Check your inbox (and spam).
            </div>
            <div className="login-alt">
              <Link href="/login">Back to sign in</Link>
            </div>
          </>
        ) : (
          <>
            {error && <div className="login-err">{error}</div>}

            <form className="login-form" onSubmit={submit}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <div className="login-alt">
              Remembered it? <Link href="/login">Sign in</Link>
            </div>
          </>
        )}

        <div className="login-footer">North Mississippi Home Professionals</div>
      </div>
    </div>
  );
}
