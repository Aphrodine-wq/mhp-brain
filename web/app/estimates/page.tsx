import { estimatesList } from "@/lib/queries";
import EstimatesTable from "./EstimatesTable";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  const estimates = await estimatesList();
  return (
    <section className="view">
      <h2>Estimates</h2>
      <div className="sub">
        Every estimate on file, newest first. Building a new one happens in the{" "}
        <b>Estimate Builder</b>.
      </div>
      <EstimatesTable estimates={estimates} />
    </section>
  );
}
