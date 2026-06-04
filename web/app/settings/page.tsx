import { stats } from "@/lib/queries";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await stats();
  return (
    <section className="view">
      <h2>Settings</h2>
      <div className="sub">Defaults for the estimator and company info. Saved to this browser.</div>

      <SettingsForm />

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
          <div className="sd">Walt Burge · Senior Project Coordinator</div>
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
