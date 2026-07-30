"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, patch } from "@/lib/client";
import { BADGE } from "@/lib/format";

const STATUSES = ["Active", "Aging", "Bid", "Paused", "Complete", "Likely Done", "Dead", "Unknown"];
const PHASES = ["lead", "quoted", "scheduled", "in_progress", "complete", "paid", "warranty"];
const LEAD_SOURCES = ["referral", "google", "facebook", "repeat", "nextdoor", "yard_sign", "other"];

export interface ProjectOps {
  lead_source: string | null;
  current_phase: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  contract_value: number | null;
  actual_start: string | null;
  actual_end: string | null;
  completion_pct: number | null;
  trello_url: string | null;
  quickbooks_url: string | null;
}

export default function HeaderEdit({
  projectId,
  projectName,
  status,
  ops,
}: {
  projectId: string;
  projectName: string;
  status: string;
  ops: ProjectOps | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    current_phase: ops?.current_phase ?? "",
    lead_source: ops?.lead_source ?? "",
    client_name: ops?.client_name ?? "",
    client_phone: ops?.client_phone ?? "",
    client_email: ops?.client_email ?? "",
    address: ops?.address ?? "",
    contract_value: ops?.contract_value != null ? String(ops.contract_value) : "",
    actual_start: ops?.actual_start ?? "",
    actual_end: ops?.actual_end ?? "",
    completion_pct: ops?.completion_pct != null ? String(ops.completion_pct) : "",
    trello_url: ops?.trello_url ?? "",
    quickbooks_url: ops?.quickbooks_url ?? "",
  });

  async function setStatus(next: string) {
    if (next === status) return;
    setBusy(true);
    try {
      await post("/api/override/status", { id: projectId, status: next, name: projectName });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    setBusy(true);
    setError(null);
    try {
      await patch("/api/jobs/details", {
        project_id: projectId,
        current_phase: form.current_phase || null,
        lead_source: form.lead_source || null,
        client_name: form.client_name || null,
        client_phone: form.client_phone || null,
        client_email: form.client_email || null,
        address: form.address || null,
        contract_value: form.contract_value === "" ? null : Number(form.contract_value),
        actual_start: form.actual_start || null,
        actual_end: form.actual_end || null,
        completion_pct: form.completion_pct === "" ? null : Number(form.completion_pct),
        trello_url: form.trello_url || null,
        quickbooks_url: form.quickbooks_url || null,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      // A rejected URL or out-of-range percentage used to fail silently here — the panel just
      // closed and the value was gone. Show what the server said instead.
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <select
        className={`badge ${BADGE[status] || "unknown"}`}
        value={status}
        disabled={busy}
        onChange={(e) => setStatus(e.target.value)}
        style={{ cursor: "pointer" }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {ops?.current_phase && <span className="badge bid">{ops.current_phase.replace("_", " ")}</span>}
      <button className="btn ghost sm" onClick={() => setOpen(!open)}>
        {open ? "Close" : "Edit details"}
      </button>

      {open && (
        <div className="panel" style={{ marginTop: 14, flexBasis: "100%" }}>
          <h3>Job details</h3>
          <div className="setrow">
            <div className="sl">Phase</div>
            <select value={form.current_phase} onChange={set("current_phase")}>
              <option value="">—</option>
              {PHASES.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="setrow">
            <div className="sl">Complete</div>
            <div className="actions">
              <input
                className="mk"
                type="number"
                min={0}
                max={100}
                step={5}
                style={{ width: 90 }}
                placeholder="—"
                value={form.completion_pct}
                onChange={set("completion_pct")}
              />
              <span className="sd">% of the work done</span>
            </div>
          </div>
          <div className="setrow">
            <div className="sl">Lead source</div>
            <select value={form.lead_source} onChange={set("lead_source")}>
              <option value="">—</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="setrow">
            <div className="sl">Client</div>
            <div className="actions">
              <input className="mk" placeholder="Name" value={form.client_name} onChange={set("client_name")} />
              <input className="mk" placeholder="Phone" value={form.client_phone} onChange={set("client_phone")} />
              <input className="mk" placeholder="Email" value={form.client_email} onChange={set("client_email")} />
            </div>
          </div>
          <div className="setrow">
            <div className="sl">Address</div>
            <input className="mk" style={{ width: 320 }} placeholder="Job address" value={form.address} onChange={set("address")} />
          </div>
          <div className="setrow">
            <div className="sl">Contract value</div>
            <input className="mk" type="number" step="0.01" placeholder="0.00" value={form.contract_value} onChange={set("contract_value")} />
          </div>
          <div className="setrow">
            <div className="sl">Actual dates</div>
            <div className="actions">
              <input className="mk" type="date" value={form.actual_start} onChange={set("actual_start")} />
              <input className="mk" type="date" value={form.actual_end} onChange={set("actual_end")} />
            </div>
          </div>
          <div className="setrow">
            <div className="sl">Trello board</div>
            <input className="mk" style={{ width: 320 }} placeholder="https://trello.com/b/…" value={form.trello_url} onChange={set("trello_url")} />
          </div>
          <div className="setrow">
            <div className="sl">QuickBooks</div>
            <input className="mk" style={{ width: 320 }} placeholder="https://app.qbo.intuit.com/app/customerdetail?nameId=…" value={form.quickbooks_url} onChange={set("quickbooks_url")} />
          </div>

          {error && <div className="conn-err">{error}</div>}

          <div className="setrow">
            <div className="sd">Changes are logged to the audit trail.</div>
            <button className="btn sm" disabled={busy} onClick={saveDetails}>
              {busy ? "Saving…" : "Save details"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
