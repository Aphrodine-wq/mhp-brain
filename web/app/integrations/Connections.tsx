"use client";

import { useEffect, useState } from "react";

export type ProviderState = {
  id: "quickbooks" | "gmail" | "microsoft";
  label: string;
  configured: boolean;
  connection: { account: string; expiresAt: string } | null;
};

// `oauthResult` is the ?oauth=connected:<p> | error:<reason> the callback bounces back with —
// passed from the server page (which owns searchParams), so we derive the notice during render
// instead of setState-in-effect. The effect only scrubs the param from the URL.
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
      ? { ok: true, text: `Connected ${oauthResult.split(":")[1] ?? ""}.` }
      : { ok: false, text: `Connection failed: ${oauthResult.replace(/^error:/, "")}` }
    : null;

  useEffect(() => {
    if (oauthResult) window.history.replaceState({}, "", window.location.pathname);
  }, [oauthResult]);

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Connections</h3>
      <div className="sd" style={{ marginBottom: 6 }}>
        Read-only links to the company books and the invoice intake mailbox. Tokens are encrypted at rest.
      </div>
      {notice && <div className={notice.ok ? "conn-ok" : "conn-err"}>{notice.text}</div>}

      {providers.map((p) => (
        <div className="setrow" key={p.id}>
          <div>
            <div className="sl">{p.label}</div>
            <div className="sd">
              {!p.configured ? (
                "Add credentials in .env.local — see OAUTH_SETUP.md."
              ) : p.connection ? (
                <>
                  Connected · <b>{p.connection.account}</b>
                </>
              ) : (
                "Configured, not connected yet."
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!p.configured ? (
              <span className="badge aging">Needs credentials</span>
            ) : p.connection ? (
              <span className="badge active">Connected</span>
            ) : (
              <span className="badge unknown">Not connected</span>
            )}

            {p.configured && p.id === "quickbooks" && (
              <a className="btn ghost" href="/api/oauth/quickbooks/start">
                {p.connection ? "Reconnect" : "Connect"}
              </a>
            )}

            {p.configured && p.id === "gmail" && (
              <>
                <input
                  className="mk"
                  placeholder="intake@box.com"
                  value={gmailBox}
                  onChange={(e) => setGmailBox(e.target.value)}
                  style={{ width: 170 }}
                />
                <button
                  className="btn ghost"
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a className="btn ghost" href="/api/oauth/microsoft/start">
                  {p.connection ? "Reconnect" : "Connect"}
                </a>
                {p.connection && (
                  <button
                    className="btn ghost"
                    disabled={syncing}
                    onClick={async () => {
                      setSyncing(true);
                      setSyncResult(null);
                      try {
                        // Discover channels first, then sync messages.
                        await fetch("/api/teams/discover");
                        const res = await fetch("/api/teams/sync", { method: "POST" });
                        const data = await res.json();
                        if (data.ok) {
                          setSyncResult(
                            `Synced ${data.channels.synced + data.chats.synced} messages, matched ${data.matched} to projects.`,
                          );
                        } else {
                          setSyncResult(`Sync error: ${data.error}`);
                        }
                      } catch {
                        setSyncResult("Sync failed — check console.");
                      }
                      setSyncing(false);
                    }}
                  >
                    {syncing ? "Syncing..." : "Sync now"}
                  </button>
                )}
              </div>
            )}
            {p.id === "microsoft" && syncResult && (
              <div className="sd" style={{ marginTop: 4 }}>{syncResult}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
