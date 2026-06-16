import Link from "next/link";
import { notFound } from "next/navigation";
import { crewList } from "@/lib/queries";
import { listDocuments } from "@/lib/documents-store";
import { initials } from "@/lib/format";
import EntityDocs from "../../_components/EntityDocs";
import CrewProfile from "./CrewProfile";

export const dynamic = "force-dynamic";

export default async function CrewDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const member = (await crewList()).find((c) => c.key === decoded);
  if (!member) notFound();
  const docs = await listDocuments({ entityType: "crew", entityId: member.key });

  return (
    <section className="view">
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="crew-av">{initials(member.name)}</div>
        <div>
          <h2 style={{ margin: 0 }}>{member.name}</h2>
          <div className="sub" style={{ margin: "2px 0 0" }}>{member.role}</div>
        </div>
      </div>

      <div className="row">
        <Link className="btn ghost" href="/crew">← All crew</Link>
        {member.phone && <a className="btn ghost" href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
        {member.email && <a className="btn ghost" href={`mailto:${member.email}`}>Email</a>}
      </div>

      <CrewProfile member={member} />

      <EntityDocs
        entityType="crew"
        entityId={member.key}
        entityLabel={member.name}
        docs={docs}
        slots={[
          { category: "W-4", required: true },
          { category: "Certification / License", required: false, hint: "Trade licenses, OSHA cards, certifications." },
          { category: "Other", required: false, hint: "Anything else worth keeping on file." },
        ]}
      />
    </section>
  );
}
