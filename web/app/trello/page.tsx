import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { isConfigured } from "@/lib/oauth/providers";
import { trelloTabData, trelloConnected, trelloAuthorizeUrl, appBaseUrl } from "@/lib/trello";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

export default async function TrelloPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "admin") {
    return (
      <section className="view">
        <h2>Trello</h2>
        <div className="sub">This view is for owners and admins.</div>
      </section>
    );
  }

  // API key missing entirely — nothing's wired.
  if (!isConfigured("trello")) {
    return (
      <section className="view">
        <h2>Trello</h2>
        <div className="sub">
          Trello isn&apos;t set up. Add it under <Link href="/integrations">Integrations</Link>,
          then sync the boards.
        </div>
      </section>
    );
  }

  // Key's set but no member token granted yet — the Connect step on Integrations was skipped.
  // Without it the sync can't authenticate, so say that plainly instead of "no cards".
  const connected = await trelloConnected().catch(() => false);
  if (!connected) {
    const connectUrl = trelloAuthorizeUrl(`${await appBaseUrl()}/integrations/trello`);
    return (
      <section className="view">
        <h2>Trello</h2>
        <div className="sub">
          The API key is set, but access hasn&apos;t been authorized yet. Click below, approve
          read-only access on Trello, then come back here and sync.
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="setrow">
            <div>
              <div className="sl">Authorize Trello</div>
              <div className="sd">Read-only, never expires. You can revoke it anytime in Trello.</div>
            </div>
            <div className="actions">
              <a className="btn" href={connectUrl}>Connect Trello</a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const data = await trelloTabData().catch(() => null);
  const lastSynced = data?.lastSynced ? new Date(data.lastSynced).toLocaleString() : null;

  return (
    <section className="view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>Trello</h2>
          <div className="sub">
            Every open card across MHP&apos;s boards, matched to jobs by name. Read-only mirror of
            the board — nothing here changes anything in Trello.
          </div>
        </div>
        <SyncButton />
      </div>

      {data && data.totalCards > 0 ? (
        <>
          <div className="cards" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
            <div className="panel" style={{ flex: 1, minWidth: 160 }}>
              <div className="sd">Open cards</div>
              <div className="big" style={{ fontSize: 28 }}>{data.totalCards}</div>
            </div>
            <div className="panel" style={{ flex: 1, minWidth: 160 }}>
              <div className="sd">Matched to a job</div>
              <div className="big" style={{ fontSize: 28 }}>{data.matched}</div>
            </div>
            <div className="panel" style={{ flex: 1, minWidth: 160 }}>
              <div className="sd">Boards</div>
              <div className="big" style={{ fontSize: 28 }}>{data.boards.length}</div>
            </div>
          </div>
          {lastSynced ? <div className="sd" style={{ marginTop: 8 }}>Last synced {lastSynced}</div> : null}

          {data.boards.map((b) => (
            <div className="panel" style={{ marginTop: 18 }} key={b.board}>
              <h3>{b.board}</h3>
              {b.cards.map((c, idx) => (
                <div className="setrow" key={`${b.board}-${idx}`}>
                  <div>
                    <div className="sl">
                      <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
                    </div>
                    <div className="sd">
                      {c.projectId ? (
                        <Link href={`/projects/${c.projectId}`}>{c.projectName}</Link>
                      ) : (
                        <span style={{ opacity: 0.6 }}>unmatched</span>
                      )}
                      {c.due ? ` · due ${c.due}` : ""}
                      {c.lastActivity ? ` · active ${c.lastActivity}` : ""}
                    </div>
                  </div>
                  <div className="actions">
                    <span className="badge bid">{c.list || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="empty" style={{ padding: "28px 20px" }}>
            <div className="big">No cards yet</div>
            Trello is connected but no open cards have synced. Hit <strong>Sync now</strong> above to
            pull the boards.
          </div>
        </div>
      )}
    </section>
  );
}
