import { redirect } from "next/navigation";
import { catalogList, estimatesList } from "@/lib/queries";
import { portfolioRealization } from "@/lib/flywheel";
import EstimatesHome from "./EstimatesHome";

export const dynamic = "force-dynamic";

// The old estimates list lives inside Projects now (each job's Estimates tile) — this route
// only serves the builder (?new=1, plus the ?scope=&sqft=&client= prefill handoff).
// Anything else lands on Projects.
export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; scope?: string; sqft?: string; client?: string }>;
}) {
  const sp = await searchParams;
  if (sp.new !== "1") redirect("/projects");

  const [estimates, catalog, realization] = await Promise.all([
    estimatesList(),
    catalogList(),
    portfolioRealization(),
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
      startNew
    />
  );
}
