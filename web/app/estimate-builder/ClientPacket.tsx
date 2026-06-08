"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { isAllowance, scopeOfServices, CONTRACT_TERMS } from "@/lib/documents";
import { ESTIMATE_SCOPE } from "@/lib/line-detail";

export interface PacketLine {
  description: string;
  detail: string | null;
  division: string;
  jobs: number;
  qty: number;
  rate: number;
}

export interface ClientInfo {
  project: string;
  clientName: string;
  address: string;
  date: string;
  preparedBy: string;
}

const divName = (d: string) => d.replace(/^Division\s*\d+:\s*/, "") || "Other";

export default function ClientPacket({
  lines,
  markup,
  client,
  onBack,
}: {
  lines: PacketLine[];
  markup: number;
  client: ClientInfo;
  onBack: () => void;
}) {
  const [showLines, setShowLines] = useState(false);

  const priced = lines.filter((l) => l.qty > 0 && l.rate > 0);
  const total = (l: PacketLine) => l.qty * l.rate;

  // division rollup, preserving first-seen order
  const order: string[] = [];
  const byDiv = new Map<string, { sum: number; lines: PacketLine[] }>();
  for (const l of priced) {
    const d = divName(l.division);
    if (!byDiv.has(d)) {
      byDiv.set(d, { sum: 0, lines: [] });
      order.push(d);
    }
    const g = byDiv.get(d)!;
    g.sum += total(l);
    g.lines.push(l);
  }

  // Mirror the working estimate's model exactly: bid = subtotal × (1 + markup), then tax.
  // Contingency is the contractor's internal buffer (shown on the working sheet, not added
  // into the client price), so the client breakdown sums cleanly to the total.
  const subtotal = priced.reduce((s, l) => s + total(l), 0);
  const bid = subtotal * (1 + (markup || 0) / 100);
  const oandp = bid - subtotal;
  const tax = bid * 0.07;
  const grand = bid + tax;

  const allowances = priced.filter(isAllowance);
  const allowanceTotal = allowances.reduce((s, l) => s + total(l), 0);
  const scope = scopeOfServices(lines.map((l) => l.division));

  return (
    <section className="packet">
      <div className="packet-bar no-print">
        <button className="btn ghost" onClick={onBack}>← Full Line Estimate</button>
        <div className="row" style={{ margin: 0, gap: 14 }}>
          <label className="chk">
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} /> Show line detail
          </label>
          <button className="btn" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      {/* ── 1. COVER PAGE ── */}
      <article className="doc-page cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="MHP" className="cover-logo" />
        <div className="cover-kicker">Construction Estimate &amp; Proposal</div>
        <h1 className="cover-title">{client.project || "Project Estimate"}</h1>
        <div className="cover-meta">
          <div><span>Prepared for</span><b>{client.clientName || "—"}</b></div>
          <div><span>Project address</span><b>{client.address || "—"}</b></div>
          <div><span>Date</span><b>{client.date || "—"}</b></div>
          <div><span>Prepared by</span><b>{client.preparedBy || "MHP Construction"}</b></div>
        </div>
        <div className="cover-total">
          <span>Estimated investment</span>
          <b>{money(grand)}</b>
          <small>includes {markup || 0}% overhead &amp; profit and 7% MS sales tax</small>
        </div>
        <div className="cover-foot">MHP Construction · Oxford, MS · MS Residential Builder R21909</div>
      </article>

      {/* ── 2. CONTRACT & SCOPE OF SERVICES ── */}
      <article className="doc-page">
        <h2 className="doc-h">Contract &amp; Scope of Services</h2>
        <h3 className="doc-sub">Scope of Services</h3>
        <p className="doc-lead">MHP Construction will furnish the following scope for {client.project || "the Project"}:</p>
        <ul className="scope-list">
          {scope.map((s, i) => (
            <li key={i}><b>{s.division}.</b> {s.summary}</li>
          ))}
        </ul>
        <h3 className="doc-sub">Agreement</h3>
        {CONTRACT_TERMS.map((t, i) => (
          <div className="clause" key={i}>
            <b>{t.heading}</b>
            <p>{t.body}</p>
          </div>
        ))}
        <div className="sign">
          <div><div className="sign-line" /><span>Owner</span><span className="sign-date">Date</span></div>
          <div><div className="sign-line" /><span>MHP Construction</span><span className="sign-date">Date</span></div>
        </div>
      </article>

      {/* ── 3. PROJECT ALLOWANCES ── */}
      <article className="doc-page">
        <h2 className="doc-h">Project Allowances</h2>
        <p className="doc-lead">
          Allowances are budget figures for selection-dependent items. The final cost follows your selections and
          adjusts the contract sum up or down by change order — no markup games, just the real number.
        </p>
        <table className="doc-table">
          <thead><tr><th>Allowance</th><th className="n">Budget</th></tr></thead>
          <tbody>
            {allowances.length ? allowances.map((l, i) => (
              <tr key={i}>
                <td>{l.description}{l.detail && <div className="line-detail">{l.detail}</div>}</td>
                <td className="n">{money(total(l))}</td>
              </tr>
            )) : (
              <tr><td colSpan={2}>No allowance items on this estimate.</td></tr>
            )}
          </tbody>
          {allowances.length > 0 && (
            <tfoot><tr><td>Total allowances carried</td><td className="n"><b>{money(allowanceTotal)}</b></td></tr></tfoot>
          )}
        </table>
      </article>

      {/* ── 4. CLIENT ESTIMATE ── */}
      <article className="doc-page">
        <h2 className="doc-h">Estimate Summary</h2>
        <p className="doc-lead">For {client.project || "the Project"} — {client.address || "MHP Construction"}.</p>
        <table className="doc-table">
          <thead><tr><th>Division</th><th className="n">Amount</th></tr></thead>
          <tbody>
            {order.map((d) => {
              const g = byDiv.get(d)!;
              return (
                <DivRow key={d} name={d} sum={g.sum} lines={g.lines} total={total} show={showLines} />
              );
            })}
          </tbody>
          <tfoot>
            <tr><td>Subtotal</td><td className="n">{money(subtotal)}</td></tr>
            <tr><td>Overhead &amp; profit ({markup || 0}%)</td><td className="n">{money(oandp)}</td></tr>
            <tr><td>MS sales tax (7%)</td><td className="n">{money(tax)}</td></tr>
            <tr className="grand"><td>Total estimated investment</td><td className="n"><b>{money(grand)}</b></td></tr>
          </tfoot>
        </table>

        <div className="scope-grid" style={{ marginTop: 22 }}>
          <div><h4>Included</h4><ul>{ESTIMATE_SCOPE.included.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><h4>Not included</h4><ul>{ESTIMATE_SCOPE.excluded.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><h4>Assumptions</h4><ul>{ESTIMATE_SCOPE.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><h4>Terms</h4><ul>{ESTIMATE_SCOPE.terms.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        </div>
      </article>
    </section>
  );
}

function DivRow({
  name, sum, lines, total, show,
}: {
  name: string; sum: number; lines: PacketLine[]; total: (l: PacketLine) => number; show: boolean;
}) {
  return (
    <>
      <tr className="div-sum"><td>{name}</td><td className="n">{money(sum)}</td></tr>
      {show && lines.map((l, i) => (
        <tr key={i} className="sub-line">
          <td>&nbsp;&nbsp;{l.description} <small>({l.qty.toLocaleString()})</small></td>
          <td className="n">{money(total(l))}</td>
        </tr>
      ))}
    </>
  );
}
