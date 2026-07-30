"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { post } from "@/lib/client";

// The trades that actually show up in the project table. Multi-trade jobs are the norm
// ("Bathroom; Addition; Garage"), so these are chips, not a single select — picked ones join
// with "; " to match the existing type strings.
const TYPE_OPTIONS = [
  "Kitchen Remodel", "Bathroom", "Addition", "Renovation", "Porch", "Deck", "Garage",
  "Bonus Room", "Roofing", "Fence", "Repair", "Door / Trim", "Carport/Outbuilding",
  "Storage / Commercial", "Commercial (Bank)", "Commercial (Vet Clinic)",
];
const MARKETS = ["Oxford", "Pickwick"];
const STATUSES = ["Active", "Bid", "Paused", "Aging", "Unknown"];

export default function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn cta" onClick={() => setOpen(true)}>
        <Plus size={16} weight="bold" />
        New Project
      </button>
      {open && <NewProjectModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [market, setMarket] = useState("Oxford");
  const [status, setStatus] = useState("Active");
  const [completion, setCompletion] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [address, setAddress] = useState("");
  const [trelloUrl, setTrelloUrl] = useState("");
  const [quickbooksUrl, setQuickbooksUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await post<{ id: string; warning?: string }>("/api/projects", {
        name: name.trim(),
        type: types.join("; "),
        market,
        status,
        completion_pct: completion === "" ? null : Number(completion),
        client_name: clientName,
        client_phone: clientPhone,
        address,
        trello_url: trelloUrl,
        quickbooks_url: quickbooksUrl,
      });
      onClose();
      router.refresh();
      router.push(`/projects/${r.id}`);
    } catch (e) {
      // Surface the server's actual message — an empty project name silently failing was a real
      // bug in the estimate builder once.
      setError(e instanceof Error ? e.message : "Could not create the project.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ animation: "rise .22s ease both" }}>
          <h3>New project</h3>

          <label>
            Project name
            <input
              value={name}
              autoFocus
              placeholder="Lou Johnson - Bathroom Remodel"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !saving) save(); }}
            />
          </label>

          <label>Work type</label>
          <div className="trade-chips">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`trade-chip${types.includes(t) ? " active" : ""}`}
                onClick={() => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="setrow">
            <div className="sl">Market</div>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="setrow">
            <div className="sl">Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
                value={completion}
                onChange={(e) => setCompletion(e.target.value)}
              />
              <span className="sd">% — leave blank if it hasn&apos;t started</span>
            </div>
          </div>

          <div className="setrow">
            <div className="sl">Client</div>
            <div className="actions">
              <input className="mk" placeholder="Name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              <input className="mk" placeholder="Phone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>

          <div className="setrow">
            <div className="sl">Address</div>
            <input className="mk" style={{ width: 320 }} placeholder="Job address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="setrow">
            <div className="sl">Trello board</div>
            <input className="mk" style={{ width: 320 }} placeholder="https://trello.com/b/… (optional)" value={trelloUrl} onChange={(e) => setTrelloUrl(e.target.value)} />
          </div>

          <div className="setrow">
            <div className="sl">QuickBooks</div>
            <input className="mk" style={{ width: 320 }} placeholder="https://app.qbo.intuit.com/… (optional)" value={quickbooksUrl} onChange={(e) => setQuickbooksUrl(e.target.value)} />
          </div>

          {error && <div className="conn-err">{error}</div>}

          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={!name.trim() || saving} onClick={save}>
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
