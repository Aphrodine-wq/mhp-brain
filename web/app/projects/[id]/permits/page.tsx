import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { getPermits } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import PermitPanel, { type Permit } from "../PermitPanel";

export const dynamic = "force-dynamic";

export default async function ProjectPermitsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const canWrite = !!(await requireRole("editor"));
  const permits = await getPermits(id).catch(() => []) as unknown as Permit[];

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href={`/projects/${id}`}>← {proj.name}</Link>
      </div>
      <h2>Permits & inspections</h2>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Track a permit</h3>
        <PermitPanel projectId={id} permits={permits} canWrite={canWrite} />
      </div>
    </section>
  );
}
