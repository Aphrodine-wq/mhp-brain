"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogRow, EstimateRow } from "@/lib/queries";
import type { RealizationFactor } from "@/lib/flywheel-insight";
import EstimatesTable from "./EstimatesTable";
import Estimator from "./Estimator";

// /estimates?new=1 is the builder. The old list mode is tucked into Projects (each job's
// Estimates tile); "back" out of the builder lands there too.
export default function EstimatesHome({
  estimates,
  catalog,
  realization,
  initialDesc,
  initialClientName,
  startNew,
}: {
  estimates: EstimateRow[];
  catalog: CatalogRow[];
  realization: RealizationFactor | null;
  initialDesc: string;
  initialClientName: string;
  startNew: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "new">(startNew ? "new" : "list");

  if (mode === "new") {
    return (
      <Estimator
        catalog={catalog}
        initialDesc={initialDesc}
        initialClientName={initialClientName}
        realization={realization}
        onBack={() => router.push("/projects")}
      />
    );
  }

  return (
    <section className="view">
      <div className="row" style={{ justifyContent: "space-between", marginTop: 0, alignItems: "flex-start" }}>
        <h2 style={{ margin: 0 }}>Estimates</h2>
        <button className="btn" onClick={() => setMode("new")}>+ New Estimate</button>
      </div>
      <EstimatesTable estimates={estimates} />
    </section>
  );
}
