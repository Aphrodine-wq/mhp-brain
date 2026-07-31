"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, CaretDown } from "@phosphor-icons/react";
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
const STATUSES = ["Active", "Bid", "Paused", "Aging", "Complete", "Unknown"];

// One control, not two. New Estimate is the frequent action so it stays a single click on the
// main segment; New Project lives behind the caret beside it, sharing the same dark button
// rather than competing with it as a second equally-weighted CTA.
export default function NewButton() {
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);

  return (
    <>
      <div className="split" onMouseLeave={() => setMenu(false)}>
        <Link className="split-main" href="/estimate-builder">
          <Plus size={16} weight="bold" />
          New Estimate
        </Link>
        <button
          className="split-more"
          aria-label="More new items"
          aria-expanded={menu}
          aria-haspopup="menu"
          onClick={() => setMenu((v) => !v)}
        >
          <CaretDown size={13} weight="bold" />
        </button>

        {menu && (
          <div className="split-menu" role="menu">
            <button
              role="menuitem"
              onClick={() => { setMenu(false); setModal(true); }}
            >
              <Plus size={13} weight="bold" />
              New project
            </button>
          </div>
        )}
      </div>
      {modal && <NewProjectModal onClose={() => setModal(false)} />}
    </>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
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

  // Two steps with the same wiz-dots / label / modal-actions shape as Add Sub (SubsTable.tsx) —
  // one long scrolling form was the odd one out among this app's modals.
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="wiz-dots" style={{ marginBottom: 14 }}>
          <i className={step >= 1 ? "on" : ""} /><i className={step >= 2 ? "on" : ""} />
        </div>

        {step === 1 && (
          <div style={{ animation: "rise .22s ease both" }}>
            <h3>New project — what is it?</h3>
            <label>
              Project name
              <input
                value={name}
                autoFocus
                placeholder="Lou Johnson - Bathroom Remodel"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep(2); }}
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

            <div className="modal-row">
              <label>
                Market
                <select value={market} onChange={(e) => setMarket(e.target.value)}>
                  {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn" disabled={!name.trim()} onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ animation: "rise .22s ease both" }}>
            <h3>Where does it stand?</h3>

            <label>
              Percent complete
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                autoFocus
                placeholder="Leave blank if it hasn't started"
                value={completion}
                onChange={(e) => setCompletion(e.target.value)}
              />
            </label>

            <div className="modal-row">
              <label>
                Client
                <input placeholder="Name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <label>
                Phone
                <input type="tel" placeholder="(662) 555-0100" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </label>
            </div>

            <label>
              Address
              <input placeholder="Job address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>

            <label>
              Trello board
              <input placeholder="https://trello.com/b/… (optional)" value={trelloUrl} onChange={(e) => setTrelloUrl(e.target.value)} />
            </label>

            <label>
              QuickBooks
              <input placeholder="https://app.qbo.intuit.com/… (optional)" value={quickbooksUrl} onChange={(e) => setQuickbooksUrl(e.target.value)} />
            </label>

            {error && <div className="conn-err">{error}</div>}

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn" disabled={saving} onClick={save}>
                {saving ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
