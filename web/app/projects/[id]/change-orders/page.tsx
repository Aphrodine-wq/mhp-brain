import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { getChangeOrders } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import ChangeOrderPanel, { type ChangeOrder } from "../ChangeOrderPanel";

export const dynamic = "force-dynamic";

export default async function ProjectChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const canWrite = !!(await requireRole("editor"));
  const changeOrders = await getChangeOrders(id).catch(() => []) as unknown as ChangeOrder[];

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href={`/projects/${id}`}>← {proj.name}</Link>
      </div>
      <h2>Change orders</h2>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Scope changes</h3>
        <ChangeOrderPanel projectId={id} changeOrders={changeOrders} canWrite={canWrite} />
      </div>
    </section>
  );
}
