"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, patch } from "@/lib/client";

const PERMIT_TYPES = ["building", "electrical", "plumbing", "mechanical", "demolition", "other"];
const RESULTS = ["pending", "passed", "failed"];

export interface Permit {
  id: number;
  permit_type: string;
  permit_number: string | null;
  applied_date: string | null;
  approved_date: string | null;
  expires_date: string | null;
  inspection_date: string | null;
  inspection_result: string | null;
}

export default function PermitPanel({
  projectId,
  permits,
  canWrite,
}: {
  projectId: string;
  permits: Permit[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [type, setType] = useState("building");
  const [number, setNumber] = useState("");
  const [applied, setApplied] = useState("");

  async function create() {
    setBusy("new");
    try {
      await post("/api/jobs/permits", {
        project_id: projectId,
        permit_type: type,
        permit_number: number || undefined,
        applied_date: applied || undefined,
        inspection_result: "pending",
      });
      setNumber(""); setApplied("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setResult(id: number, inspection_result: string) {
    setBusy(id);
    try {
      await patch("/api/jobs/permits", { id, inspection_result });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {canWrite && (
        <div className="setrow" style={{ flexWrap: "wrap" }}>
          <div className="actions" style={{ justifyContent: "flex-start", flex: 1 }}>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {PERMIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="mk" style={{ width: 150 }} placeholder="Permit #"
                   value={number} onChange={(e) => setNumber(e.target.value)} />
            <input className="mk" type="date" value={applied} onChange={(e) => setApplied(e.target.value)} />
            <button className="btn sm" disabled={busy === "new"} onClick={create}>
              {busy === "new" ? "Adding…" : "Add permit"}
            </button>
          </div>
        </div>
      )}
      {permits.length === 0 ? (
        <div className="empty" style={{ padding: "28px 20px" }}>
          <div className="big">No permits tracked</div>
          Permits, inspections, and expiration dates land here.
        </div>
      ) : (
        permits.map((pm) => (
          <div className="setrow" key={pm.id}>
            <div>
              <div className="sl">{pm.permit_type}{pm.permit_number ? ` · #${pm.permit_number}` : ""}</div>
              <div className="sd">
                {pm.applied_date ? `applied ${pm.applied_date}` : "not applied"}
                {pm.approved_date ? ` · approved ${pm.approved_date}` : ""}
                {pm.inspection_date ? ` · inspection ${pm.inspection_date}` : ""}
                {pm.expires_date ? ` · expires ${pm.expires_date}` : ""}
              </div>
            </div>
            <div className="actions">
              <span className={`badge ${pm.inspection_result === "passed" ? "active" : pm.inspection_result === "failed" ? "dead" : "aging"}`}>
                {pm.inspection_result || "pending"}
              </span>
              {canWrite && pm.inspection_result === "pending" && RESULTS.filter((r) => r !== "pending").map((r) => (
                <button key={r} className="btn ghost sm" disabled={busy === pm.id} onClick={() => setResult(pm.id, r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
