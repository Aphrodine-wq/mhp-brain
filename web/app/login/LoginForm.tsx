"use client";

import { useState } from "react";
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

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 18 18" width="20" height="20" aria-hidden="true">
      <rect fill="#F25022" x="0" y="0" width="8.5" height="8.5" />
      <rect fill="#7FBA00" x="9.5" y="0" width="8.5" height="8.5" />
      <rect fill="#00A4EF" x="0" y="9.5" width="8.5" height="8.5" />
      <rect fill="#FFB900" x="9.5" y="9.5" width="8.5" height="8.5" />
    </svg>
  );
}

function QuickBooksMark() {
  // Intuit QuickBooks mark — green disc with a centered "qb"-style hole.
  return (
    <svg viewBox="0 0 18 18" width="20" height="20" aria-hidden="true">
      <circle cx="9" cy="9" r="9" fill="#2CA01C" />
      <path
        fill="#fff"
        d="M5.2 5.2a3.8 3.8 0 0 0 0 7.6h.7V11.4h-.7a2.4 2.4 0 0 1 0-4.8h.5v7.9h1.4V5.2H5.2zm6.2 0v1.4h.7a2.4 2.4 0 0 1 0 4.8h-.5V4.1h-1.4v9.5h2.4a3.8 3.8 0 0 0 0-7.6h-.7z"
      />
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
      <div className="login-box">
        {/* Logo — big and centered */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/logo.png" alt="MHP Construction" />
        <h1 className="login-title">MHP Construction</h1>
        <p className="login-subtitle">Sign in to your account</p>

        {shownError && <div className="login-err">{shownError}</div>}

        {/* OAuth buttons — always rendered. Each provider's /start route degrades
            gracefully (bounces back to /login?error=*_unavailable) when its creds
            aren't set, so a not-yet-configured provider shows a friendly message
            instead of being silently hidden. */}
        <div className="login-oauth">
          <a className="login-oauth-btn" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
            <GoogleMark />
            Sign in with Google
          </a>
          <a className="login-oauth-btn login-oauth-ms" href={`/api/auth/microsoft/start?next=${encodeURIComponent(next)}`}>
            <MicrosoftMark />
            Sign in with Microsoft
          </a>
          <a className="login-oauth-btn login-oauth-qb" href={`/api/auth/quickbooks/start?next=${encodeURIComponent(next)}`}>
            <QuickBooksMark />
            Sign in with QuickBooks
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
  );
}
