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
        <h2>Connected Services</h2>
        <div className="sub">Only admins can connect services. Ask your admin to set these up.</div>
      </section>
    );
  }

  const conn = (id: ProviderState["id"]) => conns.find((c) => c.provider === id) ?? null;
  const providers: ProviderState[] = [
    { id: "quickbooks", label: "QuickBooks", configured: isConfigured("quickbooks"), connection: conn("quickbooks") },
    { id: "gmail", label: "Gmail (Invoice Capture)", configured: isConfigured("gmail"), connection: conn("gmail") },
    { id: "microsoft", label: "Microsoft Teams", configured: isConfigured("microsoft"), connection: conn("microsoft") },
  ];

  return (
    <section className="view">
      <h2>Connected Services</h2>
      <div className="sub">Link your company accounts to pull in real job costs, invoices, and team conversations.</div>
      <Connections providers={providers} oauthResult={oauth ?? null} />
    </section>
  );
}
