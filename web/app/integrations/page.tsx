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
        <div className="sub">Connecting QuickBooks or Gmail requires an admin — ask an admin to set these up.</div>
      </section>
    );
  }

  const conn = (id: ProviderState["id"]) => conns.find((c) => c.provider === id) ?? null;
  const providers: ProviderState[] = [
    { id: "quickbooks", label: "QuickBooks", configured: isConfigured("quickbooks"), connection: conn("quickbooks") },
    { id: "gmail", label: "Google (Gmail intake)", configured: isConfigured("gmail"), connection: conn("gmail") },
  ];

  return (
    <section className="view">
      <h2>Integrations</h2>
      <div className="sub">Read-only links to the company books (QuickBooks) and the invoice intake mailbox (Gmail).</div>
      <Connections providers={providers} oauthResult={oauth ?? null} />
    </section>
  );
}
