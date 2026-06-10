"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SubRow } from "@/lib/queries";
import { post } from "@/lib/client";
import CollapseSection from "../_components/CollapseSection";

// Raw trade strings are free text ("Plumber", "Plumbing", "Dirt work/concrete"…) —
// bucket them into canonical groups for display. First match wins; the row still
// shows (and edits) the raw trade underneath.
const TRADE_GROUPS: [RegExp, string][] = [
  [/handyman|andyman/i, "Handyman"],
  [/plumb/i, "Plumbing"],
  [/electric/i, "Electrical"],
  [/hvac|heat\b|\bair\b/i, "HVAC"],
  [/mason|concrete|dirt|block|brick|stain/i, "Masonry & Concrete"],
  [/cabinet|millwork|woodwork|epoxy/i, "Cabinets & Millwork"],
  [/paint/i, "Painting"],
  [/tile/i, "Tile"],
  [/drywall|sheetrock/i, "Drywall"],
  [/roof/i, "Roofing"],
  [/floor|carpet|lvt/i, "Flooring"],
  [/fram|carpent/i, "Framing & Carpentry"],
  [/landscap|pressure|yard|deck|dock|fence|grading/i, "Outdoor & Sitework"],
  [/suppl|lumber|big box/i, "Suppliers"],
  [/financ/i, "Financing"],
];

// Offered in the Add Sub trade datalist
const TRADE_OPTIONS = [...new Set(TRADE_GROUPS.map(([, g]) => g))].filter(
  (g) => !["Suppliers", "Financing"].includes(g),
);

function tradeGroupOf(trade: string): string {
  const t = trade.trim();
  if (!t) return "Unassigned";
  for (const [re, group] of TRADE_GROUPS) if (re.test(t)) return group;
  return "Other";
}

// Minimal typing for the Contact Picker API (Chrome/Android); absent elsewhere.
interface ContactsManager {
  select(props: string[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
}

export default function SubsTable({ subs }: { subs: SubRow[] }) {
  const router = useRouter();
  const [f, setF] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const list = subs.filter((x) => (x.name + " " + x.trade).toLowerCase().includes(f.toLowerCase()));

  const groups = new Map<string, SubRow[]>();
  for (const s of list) {
    const g = tradeGroupOf(s.trade);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  // alphabetical, with the catch-all buckets pinned last
  const order = [...groups.keys()].sort((a, b) => {
    const tail = (g: string) => (g === "Unassigned" ? 2 : g === "Other" ? 1 : 0);
    return tail(a) - tail(b) || a.localeCompare(b);
  });

  function startEdit(s: SubRow) {
    setEditing(s.key);
    setTrade(s.trade);
    setPhone(s.phone);
  }
  async function save(s: SubRow) {
    setBusy(s.key);
    try {
      await post("/api/sub", { name: s.name, trade, phone });
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function toggleVerified(s: SubRow) {
    setBusy(s.key);
    try {
      await post("/api/sub", { name: s.name, verified: (!s.verified).toString() });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="filterbar">
        <input placeholder="Filter subs…" value={f} onChange={(e) => setF(e.target.value)} />
        <span className="sub" style={{ margin: 0 }}>{list.length} on the bench</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setShowAdd(true)}>+ Add Sub</button>
      </div>

      {order.map((g) => (
        <TradeSection
          key={g}
          group={g}
          rows={groups.get(g)!}
          filtering={f !== ""}
          editing={editing}
          trade={trade}
          phone={phone}
          busy={busy}
          setTrade={setTrade}
          setPhone={setPhone}
          startEdit={startEdit}
          cancelEdit={() => setEditing(null)}
          save={save}
          toggleVerified={toggleVerified}
        />
      ))}
      {list.length === 0 && (
        <div className="empty">
          <div className="big">No subs match</div>
          Try a different search, or clear the filter.
        </div>
      )}

      {showAdd && <AddSubModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); router.refresh(); }} />}
    </>
  );
}

function TradeSection({
  group,
  rows,
  filtering,
  editing,
  trade,
  phone,
  busy,
  setTrade,
  setPhone,
  startEdit,
  cancelEdit,
  save,
  toggleVerified,
}: {
  group: string;
  rows: SubRow[];
  filtering: boolean;
  editing: string | null;
  trade: string;
  phone: string;
  busy: string | null;
  setTrade: (v: string) => void;
  setPhone: (v: string) => void;
  startEdit: (s: SubRow) => void;
  cancelEdit: () => void;
  save: (s: SubRow) => void;
  toggleVerified: (s: SubRow) => void;
}) {
  return (
    <CollapseSection title={group} summary={`${rows.length} sub${rows.length === 1 ? "" : "s"}`} forceOpen={filtering}>
      <table className="dtable">
        <thead>
          <tr><th>Name</th><th>Trade / Type</th><th>Phone</th><th className="n">Jobs</th><th>Source</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((x) => {
            const ed = editing === x.key;
            return (
              <tr key={x.key}>
                <td>
                  <Link href={`/subs/${encodeURIComponent(x.key)}`} className="cell-link">{x.name}</Link>{" "}
                  {x.verified && <span className="badge active" title="Confirmed">✓</span>}
                </td>
                <td>{ed ? <input value={trade} onChange={(e) => setTrade(e.target.value)} style={{ width: 150 }} /> : x.trade || "—"}</td>
                <td>{ed ? <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 130 }} /> : x.phone || "—"}</td>
                <td className="n">{x.jobs || "—"}</td>
                <td><small className="j">{x.source}</small></td>
                <td className="n" style={{ whiteSpace: "nowrap" }}>
                  {ed ? (
                    <>
                      <button className="btn ghost sm" disabled={busy === x.key} onClick={() => save(x)}>Save</button>{" "}
                      <button className="x" onClick={cancelEdit}>×</button>
                    </>
                  ) : (
                    <>
                      <button className="btn ghost sm" onClick={() => startEdit(x)}>Edit</button>{" "}
                      <button className="btn ghost sm" disabled={busy === x.key} onClick={() => toggleVerified(x)}>
                        {x.verified ? "Unconfirm" : "Confirm"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </CollapseSection>
  );
}

// crude-but-effective vCard reader: FN (display name) + first TEL per card
function parseVcf(text: string): { name: string; phone: string }[] {
  return text
    .split(/BEGIN:VCARD/i)
    .map((card) => {
      const name = card.match(/^FN[^:]*:(.+)$/im)?.[1]?.trim() ?? "";
      const phone = card.match(/^TEL[^:]*:(.+)$/im)?.[1]?.trim() ?? "";
      return { name, phone };
    })
    .filter((c) => c.name);
}

function AddSubModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canPick = typeof navigator !== "undefined" && "contacts" in navigator;

  async function addOne(sub: { name: string; trade?: string; phone?: string; source?: string }) {
    const r = await fetch("/api/subs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    if (!r.ok) throw new Error((await r.json()).error ?? "save failed");
  }

  async function saveManual() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addOne({ name, trade, phone, source: "manual" });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  }

  // shared by both import paths — posts each contact, reports adds/skips (dupes 409)
  async function importContacts(contacts: { name: string; phone: string }[]) {
    setSaving(true);
    setError(null);
    let ok = 0,
      skipped = 0;
    for (const c of contacts) {
      try {
        await addOne({ name: c.name, phone: c.phone, source: "contacts" });
        ok++;
      } catch {
        skipped++;
      }
    }
    setSaving(false);
    setImported(`Imported ${ok}${skipped ? `, skipped ${skipped} (already on the roster)` : ""}.`);
  }

  async function pickContacts() {
    try {
      const picked = await (navigator as unknown as { contacts: ContactsManager }).contacts.select(
        ["name", "tel"],
        { multiple: true },
      );
      await importContacts(
        picked
          .map((c) => ({ name: c.name?.[0] ?? "", phone: c.tel?.[0] ?? "" }))
          .filter((c) => c.name),
      );
    } catch {
      /* user cancelled the picker */
    }
  }

  async function onVcf(file: File | undefined) {
    if (!file) return;
    const contacts = parseVcf(await file.text());
    if (!contacts.length) {
      setError("No contacts found in that file.");
      return;
    }
    await importContacts(contacts);
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Sub</h3>
        <label>Name<input value={name} autoFocus placeholder="Bobby Ray Concrete" onChange={(e) => setName(e.target.value)} /></label>
        <label>
          Trade / Service
          <input value={trade} list="trade-options" placeholder="Plumbing" onChange={(e) => setTrade(e.target.value)} />
          <datalist id="trade-options">
            {TRADE_OPTIONS.map((t) => <option key={t} value={t} />)}
          </datalist>
        </label>
        <label>Phone<input value={phone} placeholder="(662) 555-0100" onChange={(e) => setPhone(e.target.value)} /></label>

        {error && <div className="conn-err">{error}</div>}
        {imported && <div className="conn-ok">{imported}</div>}

        <div className="modal-import">
          {canPick && (
            <button className="btn ghost sm" disabled={saving} onClick={pickContacts}>Import from Contacts</button>
          )}
          <button className="btn ghost sm" disabled={saving} onClick={() => fileRef.current?.click()}>
            Import contacts file (.vcf)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".vcf,text/vcard"
            style={{ display: "none" }}
            onChange={(e) => onVcf(e.target.files?.[0])}
          />
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={imported ? onSaved : onClose}>{imported ? "Done" : "Cancel"}</button>
          <button className="btn" disabled={saving || !name.trim()} onClick={saveManual}>
            {saving ? "Saving…" : "Add Sub"}
          </button>
        </div>
      </div>
    </div>
  );
}
