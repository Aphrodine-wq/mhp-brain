"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";
import { money } from "@/lib/format";

const METHODS = ["check", "cash", "card", "ach", "other"];
const TYPES = ["deposit", "draw", "final", "change_order", "other"];

export interface Payment {
  id: number;
  amount: number;
  payment_date: string;
  method: string | null;
  payment_type: string | null;
  reference: string | null;
  recorded_by: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function PaymentForm({
  projectId,
  payments,
  contractValue,
  canWrite,
}: {
  projectId: string;
  payments: Payment[];
  contractValue: number | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("check");
  const [type, setType] = useState("draw");
  const [reference, setReference] = useState("");

  const collected = payments.reduce((s, p) => s + p.amount, 0);

  async function record() {
    if (amount === "" || Number(amount) <= 0) return;
    setBusy(true);
    try {
      await post("/api/jobs/payments", {
        project_id: projectId,
        amount: Number(amount),
        payment_date: date,
        method,
        payment_type: type,
        reference: reference || undefined,
      });
      setAmount(""); setReference("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="setrow">
        <div className="sd">collected {money(collected)}{contractValue ? ` of ${money(contractValue)} contract` : ""}</div>
        {contractValue != null && contractValue > 0 && (
          <div className="sd">{Math.round((collected / contractValue) * 100)}%</div>
        )}
      </div>
      {canWrite && (
        <div className="setrow" style={{ flexWrap: "wrap" }}>
          <div className="actions" style={{ justifyContent: "flex-start", flex: 1 }}>
            <input className="mk" style={{ width: 120 }} type="number" step="0.01" placeholder="Amount"
                   value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="mk" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input className="mk" style={{ width: 140 }} placeholder="Check # / ref"
                   value={reference} onChange={(e) => setReference(e.target.value)} />
            <button className="btn sm" disabled={busy || amount === "" || Number(amount) <= 0} onClick={record}>
              {busy ? "Recording…" : "Record payment"}
            </button>
          </div>
        </div>
      )}
      {payments.length === 0 ? (
        <div className="empty" style={{ padding: "28px 20px" }}>
          <div className="big">No payments recorded</div>
          Deposits, draws, and final payments land here.
        </div>
      ) : (
        payments.map((p) => (
          <div className="setrow" key={p.id}>
            <div>
              <div className="sl">{money(p.amount)}</div>
              <div className="sd">
                {p.payment_date}{p.payment_type ? ` · ${p.payment_type.replace("_", " ")}` : ""}
                {p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ref ${p.reference}` : ""}
                {p.recorded_by ? ` · ${p.recorded_by}` : ""}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
