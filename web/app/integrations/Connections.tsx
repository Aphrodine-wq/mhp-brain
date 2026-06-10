"use client";

import { useEffect, useState } from "react";

export type ProviderState = {
  id: "quickbooks" | "gmail" | "microsoft";
  label: string;
  configured: boolean;
  connection: { account: string; expiresAt: string } | null;
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
