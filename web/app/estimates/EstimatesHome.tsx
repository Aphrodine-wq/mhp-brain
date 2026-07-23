"use client";

import { useState } from "react";
import type { CatalogRow, EstimateRow } from "@/lib/queries";
import type { RealizationFactor } from "@/lib/flywheel-insight";
import EstimatesTable from "./EstimatesTable";
import Estimator from "./Estimator";

// /estimates is both surfaces in one: the saved-estimates list by default, the
// Estimate Builder behind "New Estimate" (or ?new=1 for handoff deep-links).
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
  const [mode, setMode] = useState<"list" | "new">(startNew ? "new" : "list");

  if (mode === "new") {
    return (
      <Estimator
        catalog={catalog}
        initialDesc={initialDesc}
        initialClientName={initialClientName}
        realization={realization}
        onBack={() => setMode("list")}
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
