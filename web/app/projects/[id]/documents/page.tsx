import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { listDocuments } from "@/lib/documents-store";
import EntityDocs from "../../../_components/EntityDocs";

export const dynamic = "force-dynamic";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const docs = await listDocuments({ entityType: "project", entityId: id }).catch(() => []);

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href={`/projects/${id}`}>← {proj.name}</Link>
      </div>
      <h2>Documents</h2>

      <div style={{ marginTop: 18 }}>
        <EntityDocs
          entityType="project"
          entityId={id}
          entityLabel={proj.name}
          docs={docs}
          slots={[
            { category: "Contract", required: true },
            { category: "Permit", required: false },
            { category: "Plan", required: false },
            { category: "Insurance (COI)", required: false },
            { category: "Other", required: false, hint: "Anything else worth keeping on this job." },
          ]}
        />
      </div>
    </section>
  );
}
