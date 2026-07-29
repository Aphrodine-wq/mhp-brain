"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

export type Invoice = {
  id: number;
  vendor: string;
  amount: number;
  invoice_date: string;
  notes: string | null;
  source: string | null;
};

// Invoice intake for one project: quick add form + running list with the bid coverage rollup.
export default function InvoiceForm({
  projectId,
  invoices,
  bidValue,
  canWrite,
}: {
  projectId: string;
  invoices: Invoice[];
  bidValue: number | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const pct = bidValue && bidValue > 0 ? Math.round((total / bidValue) * 100) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor.trim() || !amount) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/jobs/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          vendor: vendor.trim(),
          amount: Number(amount),
          invoice_date: date,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Couldn't save the invoice.");
        setBusy(false);
        return;
      }
      setVendor(""); setAmount(""); setNotes("");
      setBusy(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="stat-grid" style={{ margin: "14px 0 4px" }}>
        <div className="metric"><div className="v sm">{money(total)}</div><div className="k">Invoiced to date</div></div>
        <div className="metric"><div className="v sm">{invoices.length}</div><div className="k">Invoices</div></div>
        {pct != null && <div className="metric"><div className="v sm">{pct}%</div><div className="k">Of bid value</div></div>}
      </div>

      {canWrite && (
        <form className="asm-inputs" style={{ marginTop: 14 }} onSubmit={submit}>
          <label>Vendor<input style={{ width: 200 }} value={vendor} placeholder="84 Lumber" onChange={(e) => setVendor(e.target.value)} /></label>
          <label>Amount<input style={{ width: 110 }} type="number" step="any" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Date<input style={{ width: 140 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Notes<input style={{ width: 200 }} value={notes} placeholder="Truss package" onChange={(e) => setNotes(e.target.value)} /></label>
          <button className="btn" type="submit" disabled={busy || !vendor.trim() || !amount}>
            {busy ? "Saving…" : "Add invoice"}
          </button>
        </form>
      )}
      {error && <div className="conn-err" style={{ marginTop: 8 }}>{error}</div>}

      <table className="dtable" style={{ marginTop: 16 }}>
        <thead>
          <tr><th>Date</th><th>Vendor</th><th>Notes</th><th className="n">Amount</th></tr>
        </thead>
        <tbody>
          {invoices.length === 0 && (
            <tr><td colSpan={4}><div className="empty" style={{ padding: "28px 16px" }}>No invoices yet — add the first one above.</div></td></tr>
          )}
          {invoices.map((i) => (
            <tr key={i.id}>
              <td>{i.invoice_date}</td>
              <td><b>{i.vendor}</b></td>
              <td><small className="j">{i.notes || "—"}</small></td>
              <td className="n">{money(Number(i.amount))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
