import { catalogList, estimatesList } from "@/lib/queries";
import { portfolioRealization } from "@/lib/flywheel";
import EstimatesHome from "./EstimatesHome";

export const dynamic = "force-dynamic";

// The estimates list and the builder share this page. ?new=1 opens straight into
// builder mode; ?scope=&sqft=&client= pre-fill it (Requests "Build estimate" handoff).
// Catalog + realization are fetched up front so the list→builder toggle is client-side.
export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; scope?: string; sqft?: string; client?: string }>;
}) {
  const [estimates, catalog, realization, sp] = await Promise.all([
    estimatesList(),
    catalogList(),
    portfolioRealization(),
    searchParams,
  ]);
  const scope = (sp.scope ?? "").trim();
  const sqft = (sp.sqft ?? "").trim();
  const initialDesc = scope && sqft ? `${scope}\n\n(~${sqft} sqft)` : scope || (sqft ? `~${sqft} sqft` : "");
  return (
    <EstimatesHome
      estimates={estimates}
      catalog={catalog}
      realization={realization}
      initialDesc={initialDesc}
      initialClientName={(sp.client ?? "").trim()}
      startNew={sp.new === "1"}
    />
  );
}
