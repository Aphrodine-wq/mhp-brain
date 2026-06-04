"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Coarse, user-facing copy for the ?error=… reasons the Google callback bounces back with. Kept
// vague on purpose — enough to act on, nothing that confirms whether an email exists.
const ERROR_TEXT: Record<string, string> = {
  not_authorized: "That Google account isn’t set up for MHP yet. Ask an admin to add you.",
  email_unverified: "Your Google email isn’t verified. Verify it with Google, then try again.",
  google_failed: "Couldn’t finish Google sign-in. Try again.",
  google_denied: "Google sign-in was cancelled.",
  state_mismatch: "That sign-in link expired. Start again.",
  google_unavailable: "Google sign-in isn’t configured yet — use email and password.",
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

export default function LoginForm({
  next,
  dev,
  google,
  error,
}: {
  next: string;
  dev: boolean;
  google: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState("");
  const [busy, setBusy] = useState(false);

  // Client-side errors (network / bad creds) win over the one carried in the URL.
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
          <h2>Estimating intelligence for North Mississippi.</h2>
          <p>Every bid, every actual, every sub — one source of truth behind your numbers.</p>
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

          {google && (
            <>
              <a className="btn-google" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
                <GoogleMark />
                Continue with Google
              </a>
              <div className="auth-or">
                <span>or</span>
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
                autoFocus
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
              {busy ? "Signing in…" : "Sign in"}
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
