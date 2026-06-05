"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ERROR_TEXT: Record<string, string> = {
  not_authorized: "That account isn't set up for MHP yet. Ask an admin to add you.",
  email_unverified: "Your email isn't verified. Verify it with your provider, then try again.",
  google_failed: "Couldn't finish Google sign-in. Try again.",
  google_denied: "Google sign-in was cancelled.",
  microsoft_failed: "Couldn't finish Microsoft sign-in. Try again.",
  microsoft_denied: "Microsoft sign-in was cancelled.",
  microsoft_unavailable: "Microsoft sign-in isn't configured yet — use another method.",
  state_mismatch: "That sign-in link expired. Start again.",
  google_unavailable: "Google sign-in isn't configured yet — use email and password.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <rect fill="#F25022" x="0" y="0" width="8.5" height="8.5" />
      <rect fill="#7FBA00" x="9.5" y="0" width="8.5" height="8.5" />
      <rect fill="#00A4EF" x="0" y="9.5" width="8.5" height="8.5" />
      <rect fill="#FFB900" x="9.5" y="9.5" width="8.5" height="8.5" />
    </svg>
  );
}

export default function LoginForm({
  next,
  dev,
  google,
  microsoft,
  error,
}: {
  next: string;
  dev: boolean;
  google: boolean;
  microsoft: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState("");
  const [busy, setBusy] = useState(false);

  const shownError = clientError || (error ? ERROR_TEXT[error] ?? "Sign-in failed." : "");
  const hasOAuth = google || microsoft;

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
      setClientError("Network error — try again");
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
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-brand-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="auth-brand-logo" src="/logo-light.png" alt="MHP" />
        </div>
        <div className="auth-brand-mid">
          <h2>The operating system for MHP Construction.</h2>
          <p>Every bid, every job, every dollar — one source of truth.</p>
        </div>
        <div className="auth-brand-foot">North Mississippi Home Professionals</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="auth-logo" src="/logo.svg" alt="MHP" />
          <h1 className="auth-h">Sign in</h1>
          <p className="auth-sub">Welcome back. Use your company account.</p>

          {shownError && <div className="login-err">{shownError}</div>}

          {/* OAuth buttons */}
          {hasOAuth && (
            <>
              <div className="auth-oauth-buttons">
                {google && (
                  <a className="btn-oauth" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
                    <GoogleMark />
                    Continue with Google
                  </a>
                )}
                {microsoft && (
                  <a className="btn-oauth btn-oauth-ms" href={`/api/auth/microsoft/start?next=${encodeURIComponent(next)}`}>
                    <MicrosoftMark />
                    Continue with Microsoft
                  </a>
                )}
              </div>
              <div className="auth-or">
                <span>or sign in with email</span>
              </div>
            </>
          )}

          <form className="auth-fields" onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus={!hasOAuth}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {dev && (
            <button type="button" className="login-dev" onClick={devLogin} disabled={busy}>
              Skip login — sign in as admin
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
