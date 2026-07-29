"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ERROR_TEXT: Record<string, string> = {
  not_authorized: "That account isn't set up yet. Ask your admin to add you.",
  email_unverified: "Your email isn't verified. Check with your email provider first.",
  google_failed: "Google sign-in didn't go through. Try again.",
  google_denied: "Google sign-in was cancelled.",
  microsoft_failed: "Microsoft sign-in didn't go through. Try again.",
  microsoft_denied: "Microsoft sign-in was cancelled.",
  microsoft_unavailable: "Microsoft sign-in isn't set up yet.",
  quickbooks_failed: "QuickBooks sign-in didn't go through. Try again.",
  quickbooks_denied: "QuickBooks sign-in was cancelled.",
  quickbooks_unavailable: "QuickBooks sign-in isn't set up yet.",
  state_mismatch: "That link expired. Try again.",
  google_unavailable: "Google sign-in isn't set up yet.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function LoginForm({
  next,
  dev,
  error,
}: {
  next: string;
  dev: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState("");
  const [busy, setBusy] = useState(false);

  const shownError = clientError || (error ? ERROR_TEXT[error] ?? "Sign-in failed." : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setClientError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setClientError(d.error || "Sign-in failed");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setClientError("Couldn't connect. Check your internet and try again.");
      setBusy(false);
    }
  }

  async function devLogin() {
    setBusy(true);
    setClientError("");
    try {
      await fetch("/api/dev-login", { method: "POST" });
      router.replace(next);
      router.refresh();
    } catch {
      setClientError("Dev login failed");
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-pitch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-pitch-logo" src="/logo-light.png" alt="MHP Construction" />
          <h1 className="login-pitch-title">Estimates and job tracking built on 149 real jobs.</h1>
        </aside>
      <div className="login-box">
        {/* Logo — big and centered */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/logo.png" alt="MHP Construction" />
        <h2 className="login-title">MHP Construction</h2>
        <p className="login-subtitle">Sign in to your account</p>

        {shownError && <div className="login-err">{shownError}</div>}

        {/* Google OAuth — its /start route degrades gracefully (bounces back to
            /login?error=google_unavailable) when creds aren't set. */}
        <div className="login-oauth">
          <a className="login-oauth-btn" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
            <GoogleMark />
            Sign in with Google
          </a>
        </div>

        <div className="login-divider">
          <span>or</span>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="login-links">
          <Link href="/forgot">Forgot password?</Link>
          <Link href="/signup">Create account</Link>
        </div>

        {dev && (
          <button type="button" className="login-dev" onClick={devLogin} disabled={busy}>
            Quick sign in (dev only)
          </button>
        )}

        <div className="login-footer">
          North Mississippi Home Professionals
        </div>
      </div>
      </div>
    </div>
  );
}
