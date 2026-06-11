"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, patch } from "@/lib/client";
import { money } from "@/lib/format";

export interface ChangeOrder {
  id: number;
  description: string;
  amount: number;
  requested_by: string | null;
  approved: number; // 0 pending, 1 approved, -1 rejected
  approved_date: string | null;
  billed: number;
  billed_date: string | null;
  created_at: string;
}

const CO_BADGE = (co: ChangeOrder) =>
  co.approved === 1 ? ["active", co.billed ? "approved · billed" : "approved"]
  : co.approved === -1 ? ["dead", "rejected"]
  : ["aging", "pending"];

export default function ChangeOrderPanel({
  projectId,
  changeOrders,
  canWrite,
}: {
  projectId: string;
  changeOrders: ChangeOrder[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [requestedBy, setRequestedBy] = useState("");

  async function create() {
    if (!desc.trim() || amount === "") return;
    setBusy("new");
    try {
      await post("/api/jobs/change-orders", {
        project_id: projectId,
        description: desc.trim(),
        amount: Number(amount),
        requested_by: requestedBy || undefined,
      });
      setDesc(""); setAmount(""); setRequestedBy("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function update(id: number, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await patch("/api/jobs/change-orders", { id, ...body });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const approvedTotal = changeOrders.filter((c) => c.approved === 1).reduce((s, c) => s + c.amount, 0);

  return (
    <div>
      {canWrite && (
        <div className="setrow" style={{ flexWrap: "wrap" }}>
          <div className="actions" style={{ justifyContent: "flex-start", flex: 1 }}>
            <input className="mk" style={{ flex: 1, minWidth: 220 }} placeholder="Scope change, in writing"
                   value={desc} onChange={(e) => setDesc(e.target.value)} />
            <input className="mk" style={{ width: 120 }} type="number" step="0.01" placeholder="Amount"
                   value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="mk" style={{ width: 140 }} placeholder="Requested by"
                   value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
            <button className="btn sm" disabled={busy === "new" || !desc.trim() || amount === ""} onClick={create}>
              {busy === "new" ? "Adding…" : "Add CO"}
            </button>
          </div>
        </div>
      )}
      {changeOrders.length > 0 && (
        <div className="setrow">
          <div className="sd">{changeOrders.length} change order{changeOrders.length === 1 ? "" : "s"}</div>
          <div className="sd">approved total {money(approvedTotal)}</div>
        </div>
      )}
      {changeOrders.length === 0 ? (
        <div className="empty" style={{ padding: "28px 20px" }}>
          <div className="big">No change orders</div>
          Every scope change gets written down before the work happens.
        </div>
      ) : (
        changeOrders.map((co) => {
          const [cls, label] = CO_BADGE(co);
          return (
            <div className="setrow" key={co.id}>
              <div>
                <div className="sl">{co.description}</div>
                <div className="sd">
                  {money(co.amount)}{co.requested_by ? ` · requested by ${co.requested_by}` : ""}
                  {co.approved_date ? ` · decided ${co.approved_date.slice(0, 10)}` : ""}
                </div>
              </div>
              <div className="actions">
                <span className={`badge ${cls}`}>{label}</span>
                {canWrite && co.approved === 0 && (
                  <>
                    <button className="btn ghost sm" disabled={busy === co.id} onClick={() => update(co.id, { approved: 1 })}>Approve</button>
                    <button className="btn ghost sm" disabled={busy === co.id} onClick={() => update(co.id, { approved: -1 })}>Reject</button>
                  </>
                )}
                {canWrite && co.approved === 1 && !co.billed && (
                  <button className="btn ghost sm" disabled={busy === co.id} onClick={() => update(co.id, { billed: true })}>Mark billed</button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
