"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Drop, Lightning, Fan, Wall, Storefront, PaintRoller, SquaresFour, House, Tree, Wrench, Package,
} from "@phosphor-icons/react";
import type { SubRow } from "@/lib/queries";
import { post } from "@/lib/client";

const TRADE_ICONS: Record<string, React.ReactNode> = {
  Plumbing: <Drop size={22} />,
  Electrical: <Lightning size={22} />,
  HVAC: <Fan size={22} />,
  "Masonry & Concrete": <Wall size={22} />,
  "Cabinets & Millwork": <Storefront size={22} />,
  Painting: <PaintRoller size={22} />,
  Tile: <SquaresFour size={22} />,
  Drywall: <Wall size={22} />,
  Roofing: <House size={22} />,
  Flooring: <SquaresFour size={22} />,
  "Framing & Carpentry": <Tree size={22} />,
  "Outdoor & Sitework": <Tree size={22} />,
  Handyman: <Wrench size={22} />,
};

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
  const [editing, setEditing] = useState<string | null>(null);
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const list = subs;

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
    setLicense(s.license);
  }
  async function save(s: SubRow) {
    setBusy(s.key);
    try {
      await post("/api/sub", { name: s.name, trade, phone, license });
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
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 0 }}>
        <button className="btn" onClick={() => setShowAdd(true)}>+ Add Sub</button>
      </div>

      {/* door cards first, like Pricing — drill into one trade at a time */}
      {!openGroup && (
        <div className="type-grid" style={{ marginTop: 22 }}>
          <button className="type-card" onClick={() => setOpenGroup("__all__")}>
            <span className="type-icon"><Package size={18} /></span>
            <span>All subs</span>
            <span className="type-sub">{list.length} total</span>
          </button>
          {order.map((g) => (
            <button key={g} className="type-card" onClick={() => setOpenGroup(g)}>
              <span className="type-icon">{TRADE_ICONS[g] ?? <Package size={22} />}</span>
              <span>{g}</span>
              <span className="type-sub">{groups.get(g)!.length} sub{groups.get(g)!.length === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      )}

      {openGroup && (
        <div style={{ marginTop: 18 }}>
          <button className="btn ghost sm" onClick={() => setOpenGroup(null)}>← All trades</button>
          {(openGroup === "__all__" ? order : [openGroup]).map((g) => (
            <TradeSection
              key={g}
              group={g}
              rows={groups.get(g)!}
              editing={editing}
              trade={trade}
              phone={phone}
              license={license}
              busy={busy}
              setTrade={setTrade}
              setPhone={setPhone}
              setLicense={setLicense}
              startEdit={startEdit}
              cancelEdit={() => setEditing(null)}
              save={save}
              toggleVerified={toggleVerified}
            />
          ))}
        </div>
      )}
      {list.length === 0 && (
        <div className="empty">
          <div className="big">No subs yet</div>
          Add your first sub to start building the directory.
        </div>
      )}

      {showAdd && <AddSubModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); router.refresh(); }} />}
    </>
  );
}

function TradeSection({
  group,
  rows,
  editing,
  trade,
  phone,
  license,
  busy,
  setTrade,
  setPhone,
  setLicense,
  startEdit,
  cancelEdit,
  save,
  toggleVerified,
}: {
  group: string;
  rows: SubRow[];
  editing: string | null;
  trade: string;
  phone: string;
  license: string;
  busy: string | null;
  setTrade: (v: string) => void;
  setPhone: (v: string) => void;
  setLicense: (v: string) => void;
  startEdit: (s: SubRow) => void;
  cancelEdit: () => void;
  save: (s: SubRow) => void;
  toggleVerified: (s: SubRow) => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 4px", fontFamily: "var(--disp)", fontSize: 20 }}>{group}</h3>
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
                <td>
                  {ed ? <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 130 }} /> : x.phone || "—"}
                  {ed && <div style={{ marginTop: 4 }}><input value={license} placeholder="License #" onChange={(e) => setLicense(e.target.value)} style={{ width: 130 }} /></div>}
                  {!ed && x.license && <div><small className="j">Lic. {x.license}</small></div>}
                </td>
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
    </div>
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
  const [step, setStep] = useState(1);
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
        <div className="wiz-dots" style={{ marginBottom: 14 }}>
          <i className={step >= 1 ? "on" : ""} /><i className={step >= 2 ? "on" : ""} />
        </div>

        {step === 1 && (
          <div style={{ animation: "rise .22s ease both" }}>
            <h3>Add Sub — who are they?</h3>
            <label>Name<input value={name} autoFocus placeholder="Bobby Ray Concrete" onChange={(e) => setName(e.target.value)} /></label>
            <label>Trade / Service</label>
            <div className="trade-chips">
              {TRADE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`trade-chip${trade === t ? " active" : ""}`}
                  onClick={() => setTrade((cur) => (cur === t ? "" : t))}
                >
                  {t}
                </button>
              ))}
            </div>

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
              <button className="btn" disabled={!name.trim()} onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ animation: "rise .22s ease both" }}>
            <h3>How do you reach them?</h3>
            <label>Phone<input value={phone} autoFocus placeholder="(662) 555-0100" type="tel" onChange={(e) => setPhone(e.target.value)} /></label>

            {error && <div className="conn-err">{error}</div>}

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn" disabled={saving} onClick={saveManual}>
                {saving ? "Saving…" : "Add Sub"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
