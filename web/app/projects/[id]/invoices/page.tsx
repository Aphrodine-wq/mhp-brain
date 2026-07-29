import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDetail } from "@/lib/queries";
import { getInvoices } from "@/lib/operations";
import { requireRole } from "@/lib/auth";
import InvoiceForm, { type Invoice } from "./InvoiceForm";

export const dynamic = "force-dynamic";

export default async function ProjectInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await projectDetail(id);
  if (!proj) notFound();
  const canWrite = !!(await requireRole("editor"));
  const invoices = await getInvoices(id).catch(() => []) as unknown as Invoice[];

  return (
    <section className="view">
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="btn ghost" href={`/projects/${id}`}>← {proj.name}</Link>
      </div>
      <h2>Invoices</h2>

      <div className="panel" style={{ marginTop: 18, paddingBottom: 16 }}>
        <h3>Vendor invoices</h3>
        <div style={{ padding: "0 20px" }}>
          <InvoiceForm projectId={id} invoices={invoices} bidValue={proj.value || null} canWrite={canWrite} />
        </div>
      </div>
    </section>
  );
}
