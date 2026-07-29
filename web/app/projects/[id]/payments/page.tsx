import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { getProjectOps, getPayments } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import PaymentForm, { type Payment } from "../PaymentForm";
import type { ProjectOps } from "../HeaderEdit";

export const dynamic = "force-dynamic";

export default async function ProjectPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const canWrite = !!(await requireRole("editor"));
  const [ops, payments] = await Promise.all([
    getProjectOps(id).catch(() => null) as Promise<ProjectOps | null>,
    getPayments(id).catch(() => []) as Promise<unknown> as Promise<Payment[]>,
  ]);

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href={`/projects/${id}`}>← {proj.name}</Link>
      </div>
      <h2>Payments</h2>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Record a payment</h3>
        <PaymentForm projectId={id} payments={payments} contractValue={ops?.contract_value ?? null} canWrite={canWrite} />
      </div>
    </section>
  );
}
