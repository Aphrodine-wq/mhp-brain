import { stats } from "@/lib/queries";
import { currentUser } from "@/lib/auth";
import { isConfigured } from "@/lib/oauth/providers";
import { listConnections } from "@/lib/oauth/store";
import SettingsForm from "./SettingsForm";
import Connections, { type ProviderState } from "./Connections";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { admin: "Admin", editor: "Editor", viewer: "Viewer" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const [{ oauth }, s, user, conns] = await Promise.all([searchParams, stats(), currentUser(), listConnections()]);
  const conn = (id: ProviderState["id"]) => conns.find((c) => c.provider === id) ?? null;
  const providers: ProviderState[] = [
    { id: "quickbooks", label: "QuickBooks", configured: isConfigured("quickbooks"), connection: conn("quickbooks") },
    { id: "gmail", label: "Google (Gmail intake)", configured: isConfigured("gmail"), connection: conn("gmail") },
  ];
  const signedInAs = user ? `${user.name} · ${ROLE_LABEL[user.role]}${user.scope ? ` · ${user.scope}` : ""}` : "—";

  return (
    <section className="view">
      <h2>Settings</h2>
      <div className="sub">Defaults for the estimator, connections, and company info.</div>

      <SettingsForm />

      {user?.role === "admin" && <Connections providers={providers} oauthResult={oauth ?? null} />}

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Company</h3>
        <div className="setrow">
          <div>
            <div className="sl">North Mississippi Home Professionals, LLC</div>
            <div className="sd">License R21909 · Oxford, MS</div>
          </div>
        </div>
        <div className="setrow">
          <div className="sl">Signed in as</div>
          <div className="sd">{signedInAs}</div>
        </div>
        <div className="setrow">
          <div className="sl">Data</div>
          <div className="sd">
            {s.projects} jobs · {s.line_items.toLocaleString("en-US")} line items · {s.subs} subs · {s.crew} crew
          </div>
        </div>
      </div>
    </section>
  );
}
