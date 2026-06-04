import { subsList } from "@/lib/queries";
import SubsTable from "./SubsTable";

export const dynamic = "force-dynamic";

export default async function SubsPage() {
  const subs = await subsList();
  return (
    <section className="view">
      <h2>Subs &amp; Suppliers</h2>
      <div className="sub">
        Pulled from the Corinth roster, estimate sheets, and job history. {subs.length} on the bench.
      </div>
      <SubsTable subs={subs} />
    </section>
  );
}
