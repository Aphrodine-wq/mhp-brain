import { stats } from "@/lib/queries";
import { currentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/role-nav";
import { allSettings } from "@/lib/integration-settings";
import { alertsConfigured } from "@/lib/alerts";
import SettingsForm from "./SettingsForm";
import NotificationPrefs from "./NotificationPrefs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, user] = await Promise.all([stats(), currentUser()]);
  const signedInAs = user ? `${user.name} · ${ROLE_LABELS[user.role]}${user.scope ? ` · ${user.scope}` : ""}` : "—";

  // Notification prefs are CEO-gated to match the save endpoint (POST /api/integration-settings) —
  // showing toggles a non-owner can't persist would just silently 401. Read current values server-side.
  const canManageAlerts = user?.role === "ceo" || user?.role === "admin";
  const alertSettings = canManageAlerts
    ? (await allSettings().catch(() => ({}) as Record<string, Record<string, string>>)).alerts ?? {}
    : {};

  return (
    <section className="view">
      <h2>Settings</h2>
      <div className="sub">Defaults for the estimator, notifications, and company info. (QuickBooks &amp; Gmail moved to Integrations.)</div>

      <SettingsForm />

      {canManageAlerts && <NotificationPrefs initial={alertSettings} configured={alertsConfigured()} />}

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
