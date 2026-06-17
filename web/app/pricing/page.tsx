import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listMaterials } from "@/lib/price-sensor";
import PricingTable from "./PricingTable";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const materials = await listMaterials();

  return (
    <section className="view">
      <h2>Pricing</h2>
      <PricingTable materials={materials} />
    </section>
  );
}
