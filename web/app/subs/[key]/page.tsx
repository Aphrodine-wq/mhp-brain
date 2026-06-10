import Link from "next/link";
import { notFound } from "next/navigation";
import { subsList } from "@/lib/queries";
import { listDocuments } from "@/lib/documents-store";
import { commsForEntity } from "@/lib/twilio";
import EntityDocs from "../../_components/EntityDocs";

export const dynamic = "force-dynamic";

export default async function SubDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const sub = (await subsList()).find((s) => s.key === decoded);
  if (!sub) notFound();
  const docs = await listDocuments({ entityType: "sub", entityId: sub.key });
  const comms = await commsForEntity("sub", sub.key).catch(() => []);
  const projects = sub.projects.split(/;|,/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="view">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{sub.name}</h2>
        {sub.verified && <span className="badge active" title="Confirmed">✓ Confirmed</span>}
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {sub.trade || "No trade set"} · {sub.phone || "no phone"}
      </div>

      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href="/subs">← All subs</Link>
        {sub.phone && <a className="btn ghost" href={`tel:${sub.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>General</h3>
        <div className="setrow">
          <div><div className="sl">Trade / Service</div></div>
          <div className="sd">{sub.trade || "—"}</div>
        </div>
        <div className="setrow">
          <div><div className="sl">Phone</div></div>
          <div className="sd">{sub.phone || "—"}</div>
        </div>
        <div className="setrow">
          <div><div className="sl">Jobs worked</div></div>
          <div className="sd">{sub.jobs || "—"}</div>
        </div>
        <div className="setrow">
          <div><div className="sl">Projects</div></div>
          <div className="sd" style={{ textAlign: "right", maxWidth: 420 }}>
            {projects.length ? projects.join(" · ") : "—"}
          </div>
        </div>
        <div className="setrow">
          <div>
            <div className="sl">MS contractor license</div>
            <div className="sd">
              <a href="https://search.msboc.us/ContractorSearch.aspx" target="_blank" rel="noreferrer" className="cell-link">
                Verify at the MS State Board of Contractors →
              </a>
            </div>
          </div>
          <div className="sd">{sub.license || "—"}</div>
        </div>
        <div className="setrow">
          <div><div className="sl">Source</div></div>
          <div className="sd">{sub.source || "—"}</div>
        </div>
      </div>

      {comms.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Recent texts &amp; calls</h3>
          {comms.map((c, i) => (
            <div className="setrow" key={i}>
              <div>
                <div className="sl">{c.kind === "call" ? (c.direction === "in" ? "Call in" : "Call out") : c.direction === "in" ? "Text in" : "Text out"}</div>
                <div className="sd">{c.body || "—"}</div>
              </div>
              <span className="sd" style={{ whiteSpace: "nowrap" }}>{c.at}</span>
            </div>
          ))}
        </div>
      )}

      <EntityDocs
        entityType="sub"
        entityId={sub.key}
        entityLabel={sub.name}
        docs={docs}
        slots={[
          { category: "W-9", required: true },
          { category: "Insurance (COI)", required: true },
          { category: "Other", required: false, hint: "Anything else worth keeping on this sub." },
        ]}
      />
    </section>
  );
}
