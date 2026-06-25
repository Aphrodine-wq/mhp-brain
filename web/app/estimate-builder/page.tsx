import { catalogList } from "@/lib/queries";
import { portfolioRealization } from "@/lib/flywheel";
import Estimator from "./Estimator";

export const dynamic = "force-dynamic";

// Pre-fills from a Requests "Build estimate" handoff: ?scope=&sqft=&client=
export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; sqft?: string; client?: string }>;
}) {
  // Portfolio realization factor for the live bid-calibration row (the flywheel). Read once
  // here and passed down; null until the first flywheel sync, in which case the row hides.
  const [catalog, realization, sp] = await Promise.all([catalogList(), portfolioRealization(), searchParams]);
  const scope = (sp.scope ?? "").trim();
  const sqft = (sp.sqft ?? "").trim();
  const initialDesc = scope && sqft ? `${scope}\n\n(~${sqft} sqft)` : scope || (sqft ? `~${sqft} sqft` : "");
  return <Estimator catalog={catalog} initialDesc={initialDesc} initialClientName={(sp.client ?? "").trim()} realization={realization} />;
}
