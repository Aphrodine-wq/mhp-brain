import { catalogList } from "@/lib/queries";
import Estimator from "./Estimator";

export const dynamic = "force-dynamic";

// Pre-fills from a Requests "Build estimate" handoff: ?scope=&sqft=&client=
export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; sqft?: string; client?: string }>;
}) {
  const catalog = await catalogList();
  const sp = await searchParams;
  const scope = (sp.scope ?? "").trim();
  const sqft = (sp.sqft ?? "").trim();
  const initialDesc = scope && sqft ? `${scope}\n\n(~${sqft} sqft)` : scope || (sqft ? `~${sqft} sqft` : "");
  return <Estimator catalog={catalog} initialDesc={initialDesc} initialClientName={(sp.client ?? "").trim()} />;
}
