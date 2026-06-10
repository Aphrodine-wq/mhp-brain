import { subsList } from "@/lib/queries";
import SubsTable from "./SubsTable";

export const dynamic = "force-dynamic";

export default async function SubsPage() {
  const subs = await subsList();
  return (
    <section className="view">
      <h2>Subs &amp; Suppliers</h2>
      <div className="sub">Grouped by trade. Pulled from the roster, estimate sheets, and job history.</div>
      <SubsTable subs={subs} />
    </section>
  );
}
