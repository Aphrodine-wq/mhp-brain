import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isConfigured } from "@/lib/oauth/providers";
import { listConnections } from "@/lib/oauth/store";
import Connections, { type ProviderState } from "./Connections";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const [{ oauth }, user, conns] = await Promise.all([searchParams, currentUser(), listConnections()]);
  if (!user) redirect("/login");

  if (user.role !== "admin") {
    return (
      <section className="view">
        <h2>Integrations</h2>
        <div className="sub">Connecting integrations requires an admin — ask an admin to set these up.</div>
      </section>
    );
  }

  const conn = (id: ProviderState["id"]) => conns.find((c) => c.provider === id) ?? null;
  const providers: ProviderState[] = [
    { id: "quickbooks", label: "QuickBooks", configured: isConfigured("quickbooks"), connection: conn("quickbooks") },
    { id: "gmail", label: "Google (Gmail intake)", configured: isConfigured("gmail"), connection: conn("gmail") },
    { id: "microsoft", label: "Microsoft Teams", configured: isConfigured("microsoft"), connection: conn("microsoft") },
  ];

  return (
    <section className="view">
      <h2>Integrations</h2>
      <div className="sub">Read-only links to the company books, invoice intake, and team communications.</div>
      <Connections providers={providers} oauthResult={oauth ?? null} />
    </section>
  );
}
