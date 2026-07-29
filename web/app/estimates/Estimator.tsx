"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CookingPot, Bathtub, PaintRoller, SquaresFour, Bed, HouseLine, Garage,
  Buildings, Warehouse, Tree, House, Wall,
} from "@phosphor-icons/react";
import type { CatalogRow } from "@/lib/queries";
import { money } from "@/lib/format";
import { ASSEMBLY_LIST, ASSEMBLY_CATEGORIES } from "@/lib/assemblies";
import { detailFor, divisionDetailFor, ESTIMATE_SCOPE } from "@/lib/line-detail";
import ClientPacket, { type ClientInfo } from "./ClientPacket";
import type { RealizationFactor } from "@/lib/flywheel-insight";

// Category cards — step 0 of the builder. Five doors into the 35 templates.
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "New Builds": <Buildings size={22} />,
  "Additions & Conversions": <HouseLine size={22} />,
  "Remodels & Interiors": <PaintRoller size={22} />,
  "Exterior & Outdoor": <Tree size={22} />,
  Commercial: <Warehouse size={22} />,
};

// Template cards — one icon per assembly.
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  kitchen: <CookingPot size={22} />,
  bathroom: <Bathtub size={22} />,
  "interior-refresh": <PaintRoller size={22} />,
  flooring: <SquaresFour size={22} />,
  "bonus-room": <Bed size={22} />,
  "room-addition": <HouseLine size={22} />,
  "garage-conversion": <Garage size={22} />,
  "new-construction": <Buildings size={22} />,
  garage: <Warehouse size={22} />,
  "deck-porch": <Tree size={22} />,
  reroof: <House size={22} />,
  siding: <Wall size={22} />,
};

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

// CSI divisions sort by their leading number, not alphabetically —
// "Division 2" must follow "Division 1", not "Division 19".
const divNum = (d: string) => {
  const m = d.match(/division\s+(\d+)/i);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

export default function Estimator({
  catalog,
  initialClientName = "",
  realization = null,
}: {
  catalog: CatalogRow[];
  initialDesc?: string;
  initialClientName?: string;
  realization?: RealizationFactor | null;
  // back to the estimates list — the builder shares /estimates with it now
  onBack?: () => void;
}) {
  const [view, setView] = useState<"input" | "load" | "result" | "packet">("input");
  const [client, setClient] = useState<ClientInfo>({ project: "", clientName: initialClientName, address: "", date: "", preparedBy: "MHP Construction" });
  const setC = (k: keyof ClientInfo, v: string) => setClient((c) => ({ ...c, [k]: v }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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

  // Win the estimate → spawn/link the project and jump to its page.
  async function createJob() {
    setJobState("creating");
    setJobError("");
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
      else {
        setJobError(d.error ?? "Couldn't create the project.");
        setJobState("error");
      }
    } catch {
      setJobError("Couldn't reach the server.");
      setJobState("error");
    }
  }
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [markup, setMarkup] = useState(18);
  const [pick, setPick] = useState(0);
  // which line's scope detail is expanded — collapsed by default so the sheet reads like a document
  const [detailKey, setDetailKey] = useState<number | null>(null);
  const [asmKey, setAsmKey] = useState<string>("");
  const [asmInputs, setAsmInputs] = useState<Record<string, number>>({});
  // universal build specifics — collected on every template, not just its two dimensions
  const [finish, setFinish] = useState<"basic" | "standard" | "premium">("standard");
  const [extraNotes, setExtraNotes] = useState("");
  // payment schedule — MHP bills in milestones; percentages, converted to dollars on the sheet
  const [milestones, setMilestones] = useState<{ label: string; pct: number }[]>([
    { label: "Contract signing", pct: 30 },
    { label: "Rough-in complete", pct: 40 },
    { label: "Final walkthrough", pct: 30 },
  ]);
  // wizard step: 0 = pick a template (categories first), 1 = project details, 2 = build specifics
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const router = useRouter();
  const [jobState, setJobState] = useState<"idle" | "creating" | "error">("idle");
  const [jobError, setJobError] = useState("");
  const keyRef = useRef(0);
  const nextKey = () => ++keyRef.current;

  const selectAssembly = (key: string) => {
    setAsmKey(key);
    const a = ASSEMBLY_LIST.find((x) => x.key === key);
    setAsmInputs(Object.fromEntries((a?.inputs ?? []).map((d) => [d.key, d.default ?? 0])));
  };

  // shared: populate the editable table from an /api/estimate response.
  // Finish level scales every rate (basic -10%, premium +15%) — it changes the bid,
  // not just a label. Extra notes land on the sheet with the template's own notes.
  function applyResult(d: { lines: SeedResult[]; notes: string[]; markup: number }) {
    setMarkup(prefs.markup ?? d.markup); // user's default markup wins over the server's

    const factor = finish === "basic" ? 0.9 : finish === "premium" ? 1.15 : 1;
    setNotes(extraNotes.trim() ? [...d.notes, extraNotes.trim()] : d.notes);
    const sorted = [...d.lines].sort((a, b) => divNum(a.division || "") - divNum(b.division || ""));
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
        // 2-decimal round, not integer — sub-$1 catalog rates (staking $0.35/SF,
        // termite $0.15/SF) must survive the finish-level factor
        rate: l.rate == null ? "" : String(Math.round(l.rate * factor * 100) / 100),
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
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0, alignItems: "flex-start" }}>
          <h2 style={{ margin: 0 }}>Estimate Builder</h2>
        </div>

        {step === 0 && !cat && (
          <div className="type-grid cats" style={{ marginTop: 22 }}>
            {ASSEMBLY_CATEGORIES.map((c) => (
              <button key={c} className="type-card" onClick={() => setCat(c)}>
                <span className="type-icon">{CATEGORY_ICONS[c] ?? <SquaresFour size={22} />}</span>
                <span>{c}</span>
              </button>
            ))}
          </div>
        )}

        {step === 0 && cat && (
          <div className="type-cat-group">
            <button className="btn ghost sm" onClick={() => setCat(null)}>← All categories</button>
            <div className="type-cat" style={{ marginTop: 14 }}>{cat}</div>
            <div className="type-grid">
              {ASSEMBLY_LIST.filter((a) => a.category === cat).map((a) => (
                <button
                  key={a.key}
                  className="type-card"
                  onClick={() => { selectAssembly(a.key); setStep(1); }}
                >
                  <span className="type-icon">{TEMPLATE_ICONS[a.key] ?? <SquaresFour size={22} />}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wiz">
            <div className="wiz-step">{asm?.label} · Step 1 of 4</div>
            <div className="wiz-dots"><i className="on" /><i /><i /><i /></div>
            <h3>The project</h3>
            <label>
              Project name
              <input
                value={client.project}
                placeholder="Smith — Kitchen Remodel"
                autoFocus
                onChange={(e) => setC("project", e.target.value)}
              />
            </label>
            <label>
              Address
              <input
                value={client.address}
                placeholder="123 County Rd 101, Oxford, MS"
                onChange={(e) => setC("address", e.target.value)}
              />
            </label>
            <div className="wiz-actions">
              <button className="btn ghost" onClick={() => setStep(0)}>← Templates</button>
              <button className="btn" onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wiz">
            <div className="wiz-step">{asm?.label} · Step 2 of 4</div>
            <div className="wiz-dots"><i className="on" /><i className="on" /><i /><i /></div>
            <h3>The client</h3>
            <label>
              Client name
              <input
                value={client.clientName}
                placeholder="John Smith"
                autoFocus
                onChange={(e) => setC("clientName", e.target.value)}
              />
            </label>
            <label>
              Phone number
              <input
                value={client.phone ?? ""}
                placeholder="(662) 555-1234"
                type="tel"
                onChange={(e) => setC("phone", e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                value={client.email ?? ""}
                placeholder="client@email.com"
                type="email"
                onChange={(e) => setC("email", e.target.value)}
              />
            </label>
            <div className="wiz-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn" onClick={() => setStep(3)}>Next →</button>
            </div>
          </div>
        )}

        {step === 3 && asm && (
          <div className="wiz">
            <div className="wiz-step">{asm.label} · Step 3 of 4</div>
            <div className="wiz-dots"><i className="on" /><i className="on" /><i className="on" /><i /></div>
            <h3>Build specifics</h3>
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
            <label>
              Finish level
              <select value={finish} onChange={(e) => setFinish(e.target.value as "basic" | "standard" | "premium")}>
                <option value="basic">Basic — builder grade (−10%)</option>
                <option value="standard">Standard — MHP typical</option>
                <option value="premium">Premium — high-end finishes (+15%)</option>
              </select>
            </label>
            <label>
              Anything else we should know?
              <textarea
                value={extraNotes}
                placeholder="Site access, existing conditions, timeline, client requests…"
                style={{ minHeight: 96 }}
                onChange={(e) => setExtraNotes(e.target.value)}
              />
            </label>
            <div className="wiz-actions">
              <button className="btn ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="btn" onClick={() => setStep(4)}>Next →</button>
            </div>
          </div>
        )}

        {step === 4 && asm && (
          <div className="wiz">
            <div className="wiz-step">{asm.label} · Step 4 of 4</div>
            <div className="wiz-dots"><i className="on" /><i className="on" /><i className="on" /><i className="on" /></div>
            <h3>Payment schedule</h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, color: "var(--ink-2)" }}>
              When does the client pay? Percentages of the total bid.
            </p>
            {milestones.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
                <label style={{ flex: 1, marginBottom: 0 }}>
                  Milestone
                  <input
                    value={m.label}
                    onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                </label>
                <label style={{ width: 90, marginBottom: 0 }}>
                  %
                  <input
                    type="number"
                    value={m.pct}
                    onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)))}
                  />
                </label>
                <button
                  className="x"
                  style={{ marginBottom: 10 }}
                  onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                  disabled={milestones.length <= 1}
                >
                  ×
                </button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 18px" }}>
              <button
                className="btn ghost sm"
                onClick={() => setMilestones((ms) => [...ms, { label: "", pct: 0 }])}
              >
                + Add milestone
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: milestones.reduce((s, m) => s + (m.pct || 0), 0) === 100 ? "var(--muted)" : "#b45309" }}>
                Total: {milestones.reduce((s, m) => s + (m.pct || 0), 0)}%
              </span>
            </div>
            <div className="wiz-actions">
              <button className="btn ghost" onClick={() => setStep(3)}>← Back</button>
              <button className="btn" onClick={buildAssembly}>Build Estimate →</button>
            </div>
          </div>
        )}
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
        milestones={milestones.filter((m) => m.label && m.pct > 0)}
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
        <button className="btn ghost sm" onClick={exportx}>Export to Excel</button>
        <button className="btn ghost sm" onClick={saveProject} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Retry save" : "Save"}
        </button>
        <button className="btn ghost sm" onClick={createJob} disabled={jobState === "creating" || !client.project.trim()}
          title={!client.project.trim() ? "Name the project first" : undefined}>
          {jobState === "creating" ? "Creating…" : jobState === "error" ? "Retry project" : "Create Project →"}
        </button>
        {jobState === "error" && jobError && <span style={{ color: "var(--warn)", fontSize: 12 }}>{jobError}</span>}
        <div className="doc-bar-bid"><span>Bid</span><b>{money(bid)}</b></div>
        <button className="btn sm" onClick={() => setView("packet")}>Client Packet →</button>
      </div>

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
                      className="cell"
                      type="number"
                      step="any"
                      value={l.rate}
                      onChange={(e) => update(l.key, "rate", e.target.value)}
                    />
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
          <div className="grand"><span>Bid</span><b>{money(bid)}</b></div>
        </div>

        {milestones.some((m) => m.label && m.pct > 0) && (
          <div className="pay-sched">
            <div className="doc-sub">Payment schedule</div>
            {milestones.filter((m) => m.label && m.pct > 0).map((m, i) => (
              <div className="pay-row" key={i}>
                <span>{m.label}</span>
                <span className="pay-pct">{m.pct}%</span>
                <b>{money(bid * (m.pct / 100))}</b>
              </div>
            ))}
          </div>
        )}

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
