"use client";

import { useEffect, useState } from "react";

export type ProviderState = {
  id: "quickbooks" | "gmail" | "microsoft";
  label: string;
  configured: boolean;
  connection: { account: string; expiresAt: string } | null;
};

// official brand marks, inlined so they render with zero external requests
const ICONS: Record<ProviderState["id"], React.ReactNode> = {
  quickbooks: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#2CA01C" />
      <text x="12" y="15.6" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="10.5" fontWeight="700" fill="#fff">qb</text>
    </svg>
  ),
  gmail: (
    <svg viewBox="0 0 256 193" aria-hidden>
      <path fill="#4285F4" d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455z" />
      <path fill="#34A853" d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798z" />
      <path fill="#EA4335" d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504z" />
      <path fill="#FBBC04" d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945z" />
      <path fill="#C5221F" d="M0 49.504 58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23z" />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  ),
};

export default function Connections({
  providers,
  oauthResult,
}: {
  providers: ProviderState[];
  oauthResult: string | null;
}) {
  const [gmailBox, setGmailBox] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const notice = oauthResult
    ? oauthResult.startsWith("connected")
      ? { ok: true, text: `Connected successfully.` }
      : oauthResult.startsWith("disconnected")
        ? { ok: true, text: `Disconnected.` }
        : { ok: false, text: `Connection failed. Try again or check your settings.` }
    : null;

  useEffect(() => {
    if (oauthResult) window.history.replaceState({}, "", window.location.pathname);
  }, [oauthResult]);

  const DESCRIPTIONS: Record<string, string> = {
    quickbooks: "Connect your QuickBooks to see real job costs, payments, and margins.",
    gmail: "Connect a dedicated email to automatically capture invoices.",
    microsoft: "Connect Microsoft Teams to pull in job conversations and files.",
  };

  const NOT_READY: Record<string, string> = {
    quickbooks: "QuickBooks connection needs to be set up by your admin.",
    gmail: "Gmail connection needs to be set up by your admin.",
    microsoft: "Teams connection needs to be set up by your admin.",
  };

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Connected services</h3>
      {notice && (
        <div className={notice.ok ? "conn-ok" : "conn-err"} style={{ margin: "14px 20px 4px" }}>
          {notice.text}
        </div>
      )}

      {providers.map((p) => (
        <div className="setrow" key={p.id}>
          <div className="conn-left">
            <div className="conn-icon">{ICONS[p.id]}</div>
            <div>
              <div className="sl">{p.label}</div>
              <div className="sd">
                {!p.configured ? (
                  NOT_READY[p.id]
                ) : p.connection ? (
                  <>
                    Connected as <b>{p.connection.account}</b>
                  </>
                ) : (
                  DESCRIPTIONS[p.id]
                )}
              </div>
              {p.id === "microsoft" && syncResult ? <div className="sd">{syncResult}</div> : null}
            </div>
          </div>
          <div className="actions">
            {!p.configured ? (
              <span className="badge aging">Not set up</span>
            ) : p.connection ? (
              <span className="badge active">Connected</span>
            ) : (
              <span className="badge unknown">Not connected</span>
            )}

            {p.configured && p.id === "quickbooks" && (
              <a className="btn ghost sm" href="/api/oauth/quickbooks/start">
                {p.connection ? "Reconnect" : "Connect"}
              </a>
            )}

            {p.configured && p.id === "gmail" && (
              <>
                <input
                  className="mk"
                  placeholder="invoices@company.com"
                  value={gmailBox}
                  onChange={(e) => setGmailBox(e.target.value)}
                />
                <button
                  className="btn ghost sm"
                  disabled={!gmailBox.trim()}
                  onClick={() =>
                    (window.location.href = "/api/oauth/gmail/start?account=" + encodeURIComponent(gmailBox.trim()))
                  }
                >
                  {p.connection ? "Reconnect" : "Connect"}
                </button>
              </>
            )}

            {p.configured && p.id === "microsoft" && (
              <>
                <a className="btn ghost sm" href="/api/oauth/microsoft/start">
                  {p.connection ? "Reconnect" : "Connect"}
                </a>
                {p.connection && (
                  <button
                    className="btn ghost sm"
                    disabled={syncing}
                    onClick={async () => {
                      setSyncing(true);
                      setSyncResult(null);
                      try {
                        await fetch("/api/teams/discover");
                        const res = await fetch("/api/teams/sync", { method: "POST" });
                        const data = await res.json();
                        if (data.ok) {
                          const total = data.channels.synced + data.chats.synced;
                          setSyncResult(
                            `Pulled ${total} message${total !== 1 ? "s" : ""}, linked ${data.matched} to jobs.`,
                          );
                        } else {
                          setSyncResult("Sync had a problem. Try again.");
                        }
                      } catch {
                        setSyncResult("Couldn't connect. Check your internet.");
                      }
                      setSyncing(false);
                    }}
                  >
                    {syncing ? "Pulling..." : "Pull latest"}
                  </button>
                )}
              </>
            )}

            {p.configured && p.connection && (
              <a className="btn ghost sm" href={`/api/oauth/${p.id}/disconnect`}>
                Disconnect
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
