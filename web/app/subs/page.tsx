import { subsList } from "@/lib/queries";
import SubsTable from "./SubsTable";

export const dynamic = "force-dynamic";

export default async function SubsPage() {
  const subs = await subsList();
  return (
    <section className="view text-110">
      <h2>Subs &amp; Suppliers</h2>
      <SubsTable subs={subs} />
    </section>
  );
}
