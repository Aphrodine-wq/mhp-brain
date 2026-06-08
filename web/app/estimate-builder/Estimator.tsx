"use client";

import { useRef, useState } from "react";
import type { CatalogRow } from "@/lib/queries";
import { money } from "@/lib/format";
import { ASSEMBLY_LIST } from "@/lib/assemblies";
import { detailFor, divisionDetailFor, ESTIMATE_SCOPE } from "@/lib/line-detail";
import ClientPacket, { type ClientInfo } from "./ClientPacket";

interface Line {
  key: number;
  description: string;
  detail: string | null;
  unit: string | null;
  division: string;
  item_no: string;
  jobs: number;
  p25: number | null;
  p75: number | null;
  kind: string;
  qty: string;
  rate: string;
}

// a line as returned by /api/estimate (qty/rate may be null)
interface SeedResult {
  description: string;
  detail: string | null;
  unit: string | null;
  division: string;
  item_no: string;
  jobs: number;
  p25: number | null;
  p75: number | null;
  kind: string;
  qty: number | null;
  rate: number | null;
}

const PLACEHOLDER =
  "e.g. Gut and remodel a 300 sqft kitchen in Oxford. Demo existing, new framing, drywall, 70 linear feet of custom cabinets, quartz countertops, LVT flooring, repaint, new electrical and plumbing fixtures, tile backsplash.";

export default function Estimator({
  catalog,
  initialDesc = "",
  initialClientName = "",
}: {
  catalog: CatalogRow[];
  initialDesc?: string;
  initialClientName?: string;
}) {
  const [view, setView] = useState<"input" | "load" | "result" | "packet">("input");
  const [client, setClient] = useState<ClientInfo>({ project: "", clientName: initialClientName, address: "", date: "", preparedBy: "MHP Construction" });
  const setC = (k: keyof ClientInfo, v: string) => setClient((c) => ({ ...c, [k]: v }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function saveProject() {
    setSaveState("saving");
    try {
      const r = await fetch("/api/estimates/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: client.project,
          clientName: client.clientName,
          address: client.address,
          estDate: client.date,
          markup,
          total: lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0) * (1 + (markup || 0) / 100),
          lines: lines.map((l) => ({ description: l.description, qty: l.qty, rate: l.rate, division: l.division, item_no: l.item_no, unit: l.unit })),
        }),
      });
      setSaveState(r.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }
  const [desc, setDesc] = useState(initialDesc);
  const [files, setFiles] = useState<FileList | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [markup, setMarkup] = useState(18);
  const [pick, setPick] = useState(0);
  const [asmKey, setAsmKey] = useState<string>("");
  const [asmInputs, setAsmInputs] = useState<Record<string, number>>({});
  const keyRef = useRef(0);
  const nextKey = () => ++keyRef.current;

  const selectAssembly = (key: string) => {
    setAsmKey(key);
    const a = ASSEMBLY_LIST.find((x) => x.key === key);
    setAsmInputs(Object.fromEntries((a?.inputs ?? []).map((d) => [d.key, d.default ?? 0])));
  };

  // shared: populate the editable table from an /api/estimate response
  function applyResult(d: { lines: SeedResult[]; notes: string[]; markup: number }) {
    setMarkup(d.markup);
    setNotes(d.notes);
    const sorted = [...d.lines].sort((a, b) => (a.division || "").localeCompare(b.division || ""));
    setLines(
      sorted.map((l) => ({
        key: nextKey(),
        description: l.description,
        detail: l.detail,
        unit: l.unit,
        division: l.division,
        item_no: l.item_no,
        jobs: l.jobs,
        p25: l.p25,
        p75: l.p75,
        kind: l.kind,
        qty: l.qty == null ? "" : String(l.qty),
        rate: l.rate == null ? "" : String(l.rate),
      })),
    );
    setView("result");
  }

  async function buildAssembly() {
    if (!asmKey) return;
    setView("load");
    const r = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assembly: asmKey, inputs: asmInputs }),
    });
    applyResult(await r.json());
  }

  async function readFiles() {
    const docs: { name: string; text?: string }[] = [];
    if (files) {
      for (const f of Array.from(files)) {
        if (/\.(txt|csv|md)$/i.test(f.name)) docs.push({ name: f.name, text: await f.text() });
        else docs.push({ name: f.name });
      }
    }
    return docs;
  }

  async function build() {
    setView("load");
    const docs = await readFiles();
    const r = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc, docs }),
    });
    applyResult(await r.json());
  }

  const update = (key: number, field: "qty" | "rate", value: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addPick = () => {
    const c = catalog[pick];
    if (!c) return;
    setLines((ls) => [
      ...ls,
      { key: nextKey(), description: c.description, detail: detailFor(c.description), unit: c.unit, division: c.division, item_no: c.item_no, jobs: c.jobs, p25: null, p75: null, kind: "added", qty: "", rate: c.rate == null ? "" : String(c.rate) },
    ]);
  };

  async function exportx() {
    const out = lines.map((l) => ({ description: l.description, qty: l.qty, rate: l.rate }));
    const r = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: out, markup }),
    });
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "MHP_Estimate.xlsx";
    a.click();
    URL.revokeObjectURL(u);
  }

  // live preview rollup
  const mk = 1 + (markup || 0) / 100;
  let sub = 0;
  const byDiv: Record<string, number> = {};
  for (const l of lines) {
    const it = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0);
    sub += it;
    const d = (l.division || "Other").replace(/^Division\s*/, "Div ").replace(/:.*$/, (m) => m.split(":")[0]);
    byDiv[d] = (byDiv[d] || 0) + it;
  }
  const cont = sub * 0.1;
  const bid = sub * mk;

  // group consecutive lines by division for header rows
  const groups: { division: string; lines: Line[] }[] = [];
  for (const l of lines) {
    const div = l.division || "Other";
    const last = groups[groups.length - 1];
    if (!last || last.division !== div) groups.push({ division: div, lines: [l] });
    else last.lines.push(l);
  }

  if (view === "input") {
    const asm = ASSEMBLY_LIST.find((a) => a.key === asmKey);
    return (
      <section className="view">
        <h2>Quick start — pick a job type</h2>
        <div className="sub">
          Pick a template and enter a couple dimensions — we build the full scope with quantities derived
          from MHP&apos;s job history. Or describe it free-form below.
        </div>
        <div className="asm-grid">
          {ASSEMBLY_LIST.map((a) => (
            <button
              key={a.key}
              className={`asm-card${asmKey === a.key ? " active" : ""}`}
              onClick={() => selectAssembly(a.key)}
            >
              <b>{a.label}</b>
              <span>{a.blurb}</span>
            </button>
          ))}
        </div>
        {asm && (
          <div className="asm-inputs">
            {asm.inputs.map((d) => (
              <label key={d.key}>
                {d.label}
                <input
                  type="number"
                  value={asmInputs[d.key] ?? ""}
                  placeholder={d.placeholder}
                  onChange={(e) => setAsmInputs((s) => ({ ...s, [d.key]: Number(e.target.value) }))}
                />
              </label>
            ))}
            <button className="btn" onClick={buildAssembly}>Build from template →</button>
          </div>
        )}

        <div className="or-sep"><span>or describe it</span></div>

        <h2>Describe the job</h2>
        <div className="sub">
          Type everything you know — scope, rooms, square footage, finishes. The more detail, the better the
          seed. You&apos;ll edit every line next.
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={PLACEHOLDER} />
        <div className="upload">
          <span className="upload-h">Upload plans, scope docs, or photos <span>(optional)</span></span>
          <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
        </div>
        <div className="row">
          <button className="btn" onClick={build}>Build Estimate →</button>
        </div>
      </section>
    );
  }

  if (view === "load") {
    return (
      <section className="view">
        <div style={{ textAlign: "center", padding: 80 }}>
          <div className="spin" />
          <div style={{ fontFamily: "var(--disp)", fontSize: 18, color: "var(--muted)" }}>
            Building your estimate from MHP history…
          </div>
        </div>
      </section>
    );
  }

  if (view === "packet") {
    const packetLines = lines.map((l) => ({
      description: l.description,
      detail: l.detail,
      division: l.division,
      jobs: l.jobs,
      qty: parseFloat(l.qty) || 0,
      rate: parseFloat(l.rate) || 0,
    }));
    return <ClientPacket lines={packetLines} markup={markup} client={client} onBack={() => setView("result")} />;
  }

  return (
    <section className="view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Full Line Estimate — working</h2>
        <div>
          <button className="btn ghost" onClick={() => setView("input")}>← New</button>{" "}
          <button className="btn ghost" onClick={exportx}>Export to Excel</button>{" "}
          <button className="btn ghost" onClick={saveProject} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Retry save" : "Save as Project"}
          </button>{" "}
          <button className="btn" onClick={() => setView("packet")}>Client Packet →</button>
        </div>
      </div>

      <div className="client-bar">
        <label>Project<input value={client.project} placeholder="Lora Hunter — Bonus Room" onChange={(e) => setC("project", e.target.value)} /></label>
        <label>Client<input value={client.clientName} placeholder="Lora Hunter" onChange={(e) => setC("clientName", e.target.value)} /></label>
        <label>Address<input value={client.address} placeholder="Oxford, MS" onChange={(e) => setC("address", e.target.value)} /></label>
        <label>Date<input value={client.date} placeholder="June 8, 2026" onChange={(e) => setC("date", e.target.value)} /></label>
      </div>
      {notes.length > 0 && <div className="notes">{notes.map((n, i) => <div key={i}>• {n}</div>)}</div>}

      <div className="est-layout">
        <div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>CSI</th><th>Item</th><th className="n">Qty</th><th>Unit</th><th className="n">Rate ($)</th>
                  <th className="n">Item Total</th><th>Backed by</th><th></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => (
                  <FragmentGroup key={gi} division={g.division}>
                    {g.lines.map((l) => {
                      const it = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0);
                      return (
                        <tr key={l.key} className={l.kind === "missing" ? "miss" : undefined}>
                          <td>{l.item_no || ""}</td>
                          <td>
                            {l.description}
                            {l.detail && <div className="line-detail">{l.detail}</div>}
                          </td>
                          <td className="n">
                            <input className="cell" type="number" value={l.qty} onChange={(e) => update(l.key, "qty", e.target.value)} />
                          </td>
                          <td>{l.unit || ""}</td>
                          <td className="n">
                            <input className="cell" type="number" step="any" value={l.rate} onChange={(e) => update(l.key, "rate", e.target.value)} />
                          </td>
                          <td className="n">{money(it)}</td>
                          <td>
                            {l.p25 != null ? (
                              <small className="j">${l.p25}–${l.p75} · {l.jobs}j</small>
                            ) : l.jobs > 0 ? (
                              <small className="j">{l.jobs}j</small>
                            ) : null}
                          </td>
                          <td><button className="x" onClick={() => remove(l.key)}>×</button></td>
                        </tr>
                      );
                    })}
                  </FragmentGroup>
                ))}
              </tbody>
            </table>
          </div>
          <div className="add">
            <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {catalog.map((x, i) => (
                <option key={i} value={i}>{x.description} — ${x.rate}/{x.unit} ({x.jobs}j)</option>
              ))}
            </select>
            <button className="btn ghost" onClick={addPick}>+ Add line</button>
          </div>
        </div>

        <div className="preview">
          <h3><span className="live" /> Live Preview</h3>
          <div className="pv-body">
            {Object.entries(byDiv).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).length ? (
              Object.entries(byDiv).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="pv-div"><span>{k}</span><b>{money(v)}</b></div>
              ))
            ) : (
              <div className="pv-div"><span>Fill quantities to price</span></div>
            )}
          </div>
          <div className="pv-tot">
            <div className="pv-line"><span>Subtotal cost</span><b>{money(sub)}</b></div>
            <div className="pv-line"><span>Contingency</span><b>{money(cont)}</b></div>
            <div className="pv-line">
              <span>Markup <input className="mk" type="number" value={markup} style={{ width: 56 }} onChange={(e) => setMarkup(Number(e.target.value))} /> %</span>
            </div>
            <div className="pv-bid"><span>Bid</span><b>{money(bid)}</b></div>
          </div>
        </div>
      </div>

      <div className="scope">
        <h3>Scope, assumptions &amp; terms</h3>
        <div className="scope-grid">
          <div>
            <h4>Included</h4>
            <ul>{ESTIMATE_SCOPE.included.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h4>Not included</h4>
            <ul>{ESTIMATE_SCOPE.excluded.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h4>Assumptions</h4>
            <ul>{ESTIMATE_SCOPE.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h4>Terms</h4>
            <ul>{ESTIMATE_SCOPE.terms.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// division header row + its lines (a <tbody> can't hold a fragment with a header <tr> cleanly via map keys otherwise)
function FragmentGroup({ division, children }: { division: string; children: React.ReactNode }) {
  const dd = divisionDetailFor(division);
  return (
    <>
      <tr className="div">
        <td colSpan={8}>
          {division}
          {dd && <span className="div-detail">{dd}</span>}
        </td>
      </tr>
      {children}
    </>
  );
}
