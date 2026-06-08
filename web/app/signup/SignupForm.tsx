"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Couldn't create your account. Try again.");
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
        <h1 className="login-title">Create your account</h1>
        <p className="login-subtitle">Join the MHP Construction workspace</p>

        {done ? (
          <>
            <div className="login-ok">
              Account requested. An admin will review and activate it — you&apos;ll be able to sign in
              once it&apos;s approved.
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
                Full name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Builder"
                  autoComplete="name"
                  required
                />
              </label>
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
              <label>
                Password
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
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </button>
            </form>

            <div className="login-alt">
              Already have an account? <Link href="/login">Sign in</Link>
            </div>
          </>
        )}

        <div className="login-footer">North Mississippi Home Professionals</div>
      </div>
    </div>
  );
}
