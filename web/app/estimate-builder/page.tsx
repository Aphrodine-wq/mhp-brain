import { catalogList } from "@/lib/queries";
import Estimator from "./Estimator";

export const dynamic = "force-dynamic";

// Pre-fills the client name from a Requests handoff: ?client=
export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const catalog = await catalogList();
  const sp = await searchParams;
  return <Estimator catalog={catalog} initialClientName={(sp.client ?? "").trim()} />;
}
