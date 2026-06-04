import { catalogList } from "@/lib/queries";
import Estimator from "./Estimator";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  const catalog = await catalogList();
  return <Estimator catalog={catalog} />;
}
