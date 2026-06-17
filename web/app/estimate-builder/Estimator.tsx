"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogRow } from "@/lib/queries";
import { money } from "@/lib/format";
import { ASSEMBLY_LIST, ASSEMBLY_CATEGORIES } from "@/lib/assemblies";
import { detailFor, divisionDetailFor, ESTIMATE_SCOPE } from "@/lib/line-detail";
import ClientPacket, { type ClientInfo } from "./ClientPacket";
import CollapseSection from "../_components/CollapseSection";

const PLACEHOLDER = "Describe the job — scope, size, finishes.";

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
  // Bid Guard exit gate — which outbound action is awaiting explicit confirmation
  const [confirmAction, setConfirmAction] = useState<null | "export" | "save" | "packet" | "createJob">(null);

  // user defaults from the Settings page (markup/contingency/display) — same localStorage
  // hydration pattern as SettingsForm: must run post-mount because this component SSRs.
  const [prefs, setPrefs] = useState({ markup: null as number | null, contPct: 10, taxPct: 7, bands: true, cont: true, packetDetail: false });
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration has no render-time equivalent under SSR */
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("mhp_settings") || "{}");
      setPrefs({
        markup: s.markup ? Number(s.markup) : null,
        contPct: s.contPct != null ? Number(s.contPct) : 10,
        taxPct: s.taxPct != null ? Number(s.taxPct) : 7,
        bands: s.bands !== false,
        cont: s.cont !== false,
        packetDetail: s.packetDetail === true,
      });
      if (s.preparedBy) setClient((c) => ({ ...c, preparedBy: s.preparedBy }));
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // Win the estimate → spawn/link the job and jump to its project page. Goes through Bid Guard
  // (guarded("createJob")) so a money-losing bid warns before it becomes a committed contract.
  async function createJob() {
    setJobState("creating");
    try {
      const total = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0) * (1 + (markup || 0) / 100);
      const r = await fetch("/api/estimates/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: client.project,
          clientName: client.clientName,
          address: client.address,
          estDate: client.date,
          markup,
          bid: total,
          lines: lines.map((l) => ({ description: l.description, qty: l.qty, rate: l.rate, division: l.division, item_no: l.item_no, unit: l.unit })),
        }),
      });
      const d = await r.json();
      if (r.ok && d.projectId) router.push(`/projects/${d.projectId}`);
      else setJobState("error");
    } catch {
      setJobState("error");
    }
  }
  const [desc, setDesc] = useState(initialDesc);
  const [files, setFiles] = useState<FileList | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [markup, setMarkup] = useState(18);
  const [pick, setPick] = useState(0);
  // which line's scope detail is expanded — collapsed by default so the sheet reads like a document
  const [detailKey, setDetailKey] = useState<number | null>(null);
  const [asmKey, setAsmKey] = useState<string>("");
  const [asmInputs, setAsmInputs] = useState<Record<string, number>>({});
  // templates are opt-in — hidden by default so the describe-it flow owns the top of the page
  const [showTemplates, setShowTemplates] = useState(false);
  const router = useRouter();
  const [jobState, setJobState] = useState<"idle" | "creating" | "error">("idle");
  const keyRef = useRef(0);
  const nextKey = () => ++keyRef.current;

  const selectAssembly = (key: string) => {
    setAsmKey(key);
    const a = ASSEMBLY_LIST.find((x) => x.key === key);
    setAsmInputs(Object.fromEntries((a?.inputs ?? []).map((d) => [d.key, d.default ?? 0])));
  };

  // shared: populate the editable table from an /api/estimate response
  function applyResult(d: { lines: SeedResult[]; notes: string[]; markup: number }) {
    setMarkup(prefs.markup ?? d.markup); // user's default markup wins over the server's

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
    const docs: { name: string; text?: string; mime?: string; data?: string }[] = [];
    if (files) {
      for (const f of Array.from(files)) {
        if (/\.(txt|csv|md)$/i.test(f.name)) {
          docs.push({ name: f.name, text: await f.text() });
        } else if (/\.(png|jpe?g|webp)$/i.test(f.name)) {
          // base64 for the vision pass — strip the data: prefix the API doesn't want
          const buf = await f.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          const mime = f.type || (/\.png$/i.test(f.name) ? "image/png" : /\.webp$/i.test(f.name) ? "image/webp" : "image/jpeg");
          docs.push({ name: f.name, mime, data: b64 });
        } else {
          docs.push({ name: f.name });
        }
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

  // live rollup — the document's own totals recompute on every keystroke
  const mk = 1 + (markup || 0) / 100;
  const lineTotal = (l: Line) => (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0);
  const sub = lines.reduce((s, l) => s + lineTotal(l), 0);
  const cont = prefs.cont ? sub * (prefs.contPct / 100) : 0;
  const bid = sub * mk;

  // Bid Guard (MARGIN_GUARD.md, Engine 2 — the slice the builder's data supports today):
  // p25 of MHP's own job history is the baseline; any line priced under it is flagged
  // with the exact dollars short, rolled up by division. Warns loudly, never blocks —
  // underpricing a loyalty client is a choice, not an error.
  const lineShort = (l: Line) => {
    const qty = parseFloat(l.qty) || 0;
    const rate = parseFloat(l.rate);
    if (l.p25 == null || qty <= 0 || !Number.isFinite(rate) || rate >= l.p25) return 0;
    return (l.p25 - rate) * qty;
  };
  const isUnder = (l: Line) => lineShort(l) > 0;
  const shortByDiv = new Map<string, { count: number; short: number }>();
  for (const l of lines) {
    const s = lineShort(l);
    if (s <= 0) continue;
    const d = l.division || "Other";
    const cur = shortByDiv.get(d) ?? { count: 0, short: 0 };
    shortByDiv.set(d, { count: cur.count + 1, short: cur.short + s });
  }
  const totalShort = [...shortByDiv.values()].reduce((s, d) => s + d.short, 0);
  // markup is not margin — show what the chosen markup actually nets (on direct cost)
  const marginPct = markup > 0 ? (markup / (100 + markup)) * 100 : 0;

  // The exit gate: while the guard is firing, every outbound path (export / save / packet)
  // requires an explicit "deliberate" confirmation. Nothing underpriced leaves by accident;
  // a chosen underprice (loyalty work) is one click — per MARGIN_GUARD.md, never a hard block.
  const guardActive = totalShort > 0 || markup <= 0;
  const runAction = (a: "export" | "save" | "packet" | "createJob") => {
    if (a === "export") exportx();
    else if (a === "save") saveProject();
    else if (a === "createJob") createJob();
    else setView("packet");
  };
  const guarded = (a: "export" | "save" | "packet" | "createJob") => (guardActive ? setConfirmAction(a) : runAction(a));

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
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>Estimate Builder</h2>
            <div className="sub" style={{ margin: "6px 0" }}>Describe the job, or start from a template.</div>
          </div>
          <button className="btn ghost" aria-expanded={showTemplates} onClick={() => setShowTemplates((v) => !v)}>
            {showTemplates ? "Hide templates" : "Templates"}
          </button>
        </div>

        {showTemplates && ASSEMBLY_CATEGORIES.map((cat) => {
          const items = ASSEMBLY_LIST.filter((a) => a.category === cat);
          return (
            <CollapseSection
              key={cat}
              title={cat}
              summary={`${items.length} template${items.length === 1 ? "" : "s"}`}
              forceOpen={items.some((a) => a.key === asmKey)}
            >
              <div className="asm-grid" style={{ margin: 0, padding: "14px 16px 16px" }}>
                {items.map((a) => (
                  <button
                    key={a.key}
                    className={`asm-card${asmKey === a.key ? " active" : ""}`}
                    onClick={() => selectAssembly(a.key)}
                  >
                    <b>{a.label}</b>
                  </button>
                ))}
              </div>
            </CollapseSection>
          );
        })}
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

        {(showTemplates || asm) && <div className="or-sep"><span>or describe it</span></div>}

        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={PLACEHOLDER} />
        <div className="upload">
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
    return (
      <ClientPacket
        lines={packetLines}
        markup={markup}
        taxPct={prefs.taxPct}
        initialShowLines={prefs.packetDetail}
        client={client}
        onBack={() => setView("result")}
      />
    );
  }

  // Working estimate, rendered as the live document itself: a letterhead sheet whose
  // numbers are editable in place and whose totals recompute as you type. Actions and
  // the running bid ride in a sticky bar so they never scroll away.
  return (
    <section className="view">
      <div className="doc-bar">
        <button className="btn ghost sm" onClick={() => setView("input")}>← New</button>
        <button className="btn ghost sm" onClick={() => guarded("export")}>Export to Excel</button>
        <button className="btn ghost sm" onClick={() => guarded("save")} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Retry save" : "Save"}
        </button>
        <button className="btn ghost sm" onClick={() => guarded("createJob")} disabled={jobState === "creating"}>
          {jobState === "creating" ? "Creating…" : jobState === "error" ? "Retry job" : "Create Job →"}
        </button>
        {totalShort > 0 && <span className="doc-bar-warn" title="Lines priced under MHP's historical baseline">{money(totalShort)} under baseline</span>}
        <div className="doc-bar-bid"><span>Bid</span><b>{money(bid)}</b></div>
        <button className="btn sm" onClick={() => guarded("packet")}>Client Packet →</button>
      </div>

      {confirmAction && (
        <div className="modal-scrim" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>This estimate loses money as priced</h3>
            <div className="warn-row" style={{ paddingBottom: 10 }}>
              {totalShort > 0 && (
                <>
                  <b style={{ color: "#9c2f23" }}>{money(totalShort)} under MHP baselines</b>
                  {" — "}
                  {[...shortByDiv.entries()].sort((a, b) => b[1].short - a[1].short).map(([d, v]) => `${d.replace(/^Division\s*\d+:\s*/, "")} (${money(v.short)})`).join(", ")}.
                </>
              )}
              {markup <= 0 && <> Markup is {markup || 0}% — no margin on the whole bid.</>}
              {" "}If this is deliberate — loyalty client, strategic price — go ahead. If not, fix the
              flagged lines first.
            </div>
            <div className="modal-actions">
              <button
                className="btn ghost"
                onClick={() => {
                  const a = confirmAction;
                  setConfirmAction(null);
                  // the override is allowed but never silent — the channel hears about it
                  void fetch("/api/alerts/bid-guard", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project: client.project, totalShort, markup, bid, action: a }),
                  }).catch(() => {});
                  runAction(a);
                }}
              >
                {confirmAction === "save" ? "Save anyway" : confirmAction === "export" ? "Export anyway" : "Continue anyway"} — deliberate
              </button>
              <button className="btn" onClick={() => setConfirmAction(null)}>Go back and fix prices</button>
            </div>
          </div>
        </div>
      )}

      {(totalShort > 0 || markup <= 0) && (
        <div className="warn-panel no-print">
          <div className="warn-h">Bid Guard — this estimate is priced to lose money</div>
          {markup <= 0 && (
            <div className="warn-row">
              <b>No margin.</b> Markup is {markup || 0}% — the bid covers cost at best. Anything goes wrong, MHP pays for it.
            </div>
          )}
          {totalShort > 0 && (
            <>
              <div className="warn-row">
                <b>{money(totalShort)} under MHP baselines.</b> These categories are priced below the
                lowest rate MHP has ever done this work for — raise them to stay profitable:
              </div>
              {[...shortByDiv.entries()].sort((a, b) => b[1].short - a[1].short).map(([d, v]) => (
                <div className="warn-row warn-div" key={d}>
                  <span>{d} — {v.count} line{v.count === 1 ? "" : "s"} under baseline</span>
                  <b>raise by {money(v.short)}</b>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="sheet">
        <header className="sheet-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MHP" className="sheet-logo" />
          <div className="sheet-co">
            <b>MHP Construction</b>
            <span>North Mississippi Home Professionals, LLC · License R21909 · Oxford, MS</span>
          </div>
          <div className="sheet-kicker">Estimate</div>
        </header>

        <input
          className="sheet-title"
          value={client.project}
          placeholder="Project name"
          onChange={(e) => setC("project", e.target.value)}
        />
        <div className="sheet-meta">
          <label>Client<input value={client.clientName} placeholder="Client name" onChange={(e) => setC("clientName", e.target.value)} /></label>
          <label>Address<input value={client.address} placeholder="Oxford, MS" onChange={(e) => setC("address", e.target.value)} /></label>
          <label>Date<input value={client.date} placeholder="June 8, 2026" onChange={(e) => setC("date", e.target.value)} /></label>
          <label>Prepared by<input value={client.preparedBy} onChange={(e) => setC("preparedBy", e.target.value)} /></label>
        </div>
        {notes.length > 0 && <div className="sheet-note">{notes.join(" ")}</div>}

        {groups.map((g, gi) => {
          const dd = divisionDetailFor(g.division);
          return (
            <div className="sheet-div" key={gi}>
              <div className="sheet-div-h">
                <span>{g.division}</span>
                <b>{money(g.lines.reduce((s, l) => s + lineTotal(l), 0))}</b>
              </div>
              {dd && <div className="sheet-div-d">{dd}</div>}
              {g.lines.map((l) => (
                <div className={`sheet-line${l.kind === "missing" ? " miss" : ""}`} key={l.key}>
                  <span className="sl-no">{l.item_no || ""}</span>
                  <div>
                    <button
                      className="sl-name"
                      onClick={() => setDetailKey((k) => (k === l.key ? null : l.key))}
                      title={l.detail ? "Show scope detail" : undefined}
                    >
                      {l.description}
                    </button>
                    {detailKey === l.key && l.detail && <div className="line-detail">{l.detail}</div>}
                  </div>
                  <span className="sl-qty">
                    <input className="cell" type="number" value={l.qty} onChange={(e) => update(l.key, "qty", e.target.value)} />
                    <small>{l.unit || ""}</small>
                  </span>
                  <span className="sl-rate">
                    <input
                      className={`cell${isUnder(l) ? " low" : ""}`}
                      type="number"
                      step="any"
                      value={l.rate}
                      onChange={(e) => update(l.key, "rate", e.target.value)}
                    />
                    {isUnder(l) ? (
                      <div className="rate-hint low">below ${l.p25} baseline · {l.jobs} jobs</div>
                    ) : prefs.bands && (l.p25 != null ? (
                      <div className="rate-hint">${l.p25}–${l.p75} · {l.jobs} jobs</div>
                    ) : l.jobs > 0 ? (
                      <div className="rate-hint">{l.jobs} jobs</div>
                    ) : null)}
                  </span>
                  <b className="sl-total">{money(lineTotal(l))}</b>
                  <button className="x" onClick={() => remove(l.key)}>×</button>
                </div>
              ))}
            </div>
          );
        })}

        <div className="sheet-add">
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
            {catalog.map((x, i) => (
              <option key={i} value={i}>{x.description} — ${x.rate}/{x.unit} ({x.jobs}j)</option>
            ))}
          </select>
          <button className="btn ghost sm" onClick={addPick}>+ Add line</button>
        </div>

        <div className="sheet-totals">
          <div><span>Subtotal cost</span><b>{money(sub)}</b></div>
          {prefs.cont && <div><span>Contingency ({prefs.contPct}%) <small className="j">internal — not in bid</small></span><b>{money(cont)}</b></div>}
          <div>
            <span>
              Markup <input className="mk" type="number" value={markup} style={{ width: 52 }} onChange={(e) => setMarkup(Number(e.target.value))} /> %
              <small className="j"> = {marginPct.toFixed(1)}% margin</small>
            </span>
            <b>{money(bid - sub)}</b>
          </div>
          <div className="grand"><span>Bid</span><b>{money(bid)}</b></div>
        </div>

        <div className="sheet-scope">
          <div className="doc-sub">Scope, assumptions &amp; terms</div>
          <div className="scope-grid">
            <div>
              <h4>Included</h4>
              <ul>{ESTIMATE_SCOPE.included.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div>
              <h4>Not included</h4>
              <ul>{ESTIMATE_SCOPE.excluded.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div>
              <h4>Assumptions</h4>
              <ul>{ESTIMATE_SCOPE.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div>
              <h4>Terms</h4>
              <ul>{ESTIMATE_SCOPE.terms.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        </div>

        <div className="sheet-foot">MHP Construction · Oxford, MS · License R21909</div>
      </div>
    </section>
  );
}
