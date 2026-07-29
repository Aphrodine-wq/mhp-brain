import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isConfigured } from "@/lib/oauth/providers";
import { listConnections } from "@/lib/oauth/store";
import Connections, { type ProviderState } from "./Connections";
import ReviewsPanel from "./ReviewsPanel";
import { recentReviews } from "@/lib/gbp";
import { allSettings } from "@/lib/integration-settings";
import SettingsPanel from "./SettingsPanel";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ oauth?: string; detail?: string }> }) {
  const [{ oauth, detail }, user, conns] = await Promise.all([searchParams, currentUser(), listConnections()]);
  if (!user) redirect("/login");

  if (user.role !== "admin" && user.role !== "ceo") {
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
    { id: "microsoft", label: "Microsoft Teams + OneDrive", configured: isConfigured("microsoft"), connection: conn("microsoft") },
    { id: "gbp", label: "Google Business Profile", configured: isConfigured("gbp"), connection: conn("gbp") },
  ];
  const reviews = await recentReviews(8).catch(() => []);
  const settings = await allSettings().catch(() => ({}));

  return (
    <section className="view">
      <h2>Integrations</h2>
      <Connections providers={providers} oauthResult={oauth ?? null} oauthDetail={detail ?? null} />
      <SettingsPanel values={settings} />
      {reviews.length > 0 && <ReviewsPanel reviews={reviews} />}
    </section>
  );
}
