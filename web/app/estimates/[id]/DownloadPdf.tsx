"use client";

import { useState } from "react";
import type { EstimateDetail } from "@/lib/queries";
import type { PdfJobInfo, PdfChangeOrderRow } from "@/lib/pdf/map";

// Renders the 6-section client packet in the browser and downloads it.
// @react-pdf/renderer is heavy — both it and the document builder load on click, not on page load.
export default function DownloadPdf({
  est,
  job,
  changeOrders,
}: {
  est: EstimateDetail;
  job: PdfJobInfo | null;
  changeOrders: PdfChangeOrderRow[];
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const [{ generateEstimatePDF }, map] = await Promise.all([
        import("@/lib/pdf/EstimatePDF"),
        import("@/lib/pdf/map"),
      ]);
      await generateEstimatePDF(
        map.toPdfEstimate(est, job),
        map.toPdfLineItems(est),
        map.toPdfClient(job),
        undefined,
        map.toPdfChangeOrders(changeOrders),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn ghost" disabled={busy} onClick={download}>
      {busy ? "Building packet…" : "Client packet ↓"}
    </button>
  );
}
