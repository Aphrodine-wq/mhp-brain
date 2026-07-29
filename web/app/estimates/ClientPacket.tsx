"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { groupFinishSelections, scopeOfServices, buildContractArticles, applySalesTax, MS_SALES_TAX_PCT, MHP_CONTRACTOR, type FinishGroup } from "@/lib/documents";
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
  phone?: string;
  email?: string;
  date: string;
  preparedBy: string;
}

const divName = (d: string) => d.replace(/^Division\s*\d+:\s*/, "") || "Other";

export default function ClientPacket({
  lines,
  markup,
  taxPct = MS_SALES_TAX_PCT,
  initialShowLines = false,
  client,
  milestones = [],
  onBack,
}: {
  lines: PacketLine[];
  markup: number;
  taxPct?: number;
  initialShowLines?: boolean;
  client: ClientInfo;
  milestones?: { label: string; pct: number }[];
  onBack: () => void;
}) {
  const [showLines, setShowLines] = useState(initialShowLines);

  const priced = lines.filter((l) => l.qty > 0 && l.rate > 0);
  const total = (l: PacketLine) => l.qty * l.rate;
  // Client-facing prices carry the markup inside them — no "overhead & profit" line anywhere.
  // Division sums and line detail add cleanly to the bid without ever exposing margin.
  const dispTotal = (l: PacketLine) => total(l) * (1 + (markup || 0) / 100);

  // division rollup, preserving first-seen order (sums shown with markup baked in)
  const order: string[] = [];
  const byDiv = new Map<string, { sum: number; lines: PacketLine[] }>();
  for (const l of priced) {
    const d = divName(l.division);
    if (!byDiv.has(d)) {
      byDiv.set(d, { sum: 0, lines: [] });
      order.push(d);
    }
    const g = byDiv.get(d)!;
    g.sum += dispTotal(l);
    g.lines.push(l);
  }

  const subtotal = priced.reduce((s, l) => s + total(l), 0);
  const bid = subtotal * (1 + (markup || 0) / 100);
  const { tax, grand } = applySalesTax(bid, taxPct);

  // Schedule A — client-selectable finishes grouped by category. These lines are
  // already in the estimate; this is a second view, and its total is what the
  // contract references as the allowance amount.
  const finishGroups = groupFinishSelections(priced, (l) => l.description, (l) => total(l));
  const allowanceTotal = finishGroups.reduce((s, g) => s + g.total, 0);
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
        <img src="/logo.png" alt="MHP" className="cover-logo" />
        <div className="cover-kicker">Construction Estimate &amp; Proposal</div>
        <h1 className="cover-title">{client.project || "Project Estimate"}</h1>
        <div className="cover-meta">
          <div><span>Prepared for</span><b>{client.clientName || "—"}</b></div>
          <div><span>Project address</span><b>{client.address || "—"}</b></div>
          {client.phone && <div><span>Phone</span><b>{client.phone}</b></div>}
          <div><span>Date</span><b>{client.date || "—"}</b></div>
          <div><span>Prepared by</span><b>{client.preparedBy || "MHP Construction"}</b></div>
        </div>
        <div className="cover-total">
          <span>Estimated investment</span>
          <b>{money(grand)}</b>
          <small>includes {taxPct || 0}% MS sales tax</small>
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
        <h3 className="doc-sub">Professional Services Construction Contract Agreement</h3>
        {buildContractArticles({ total: grand, allowanceTotal, clientName: client.clientName, address: client.address }).map((t, i) => (
          <div className="clause" key={i}>
            <b>{t.heading}</b>
            <p>{t.body}</p>
          </div>
        ))}
        <div className="sign">
          <div><div className="sign-line" /><span>{client.clientName || "Owner"}</span><span className="sign-date">Date</span></div>
          <div><div className="sign-line" /><span>{MHP_CONTRACTOR.signers[0]}</span><span className="sign-date">Date</span></div>
          <div><div className="sign-line" /><span>{MHP_CONTRACTOR.signers[1]}</span><span className="sign-date">Date</span></div>
        </div>
        <p className="contract-foot">{MHP_CONTRACTOR.entity} · {MHP_CONTRACTOR.address} · {MHP_CONTRACTOR.license}</p>
      </article>

      {/* ── 3. FINISH SELECTIONS & ALLOWANCE SCHEDULE ── */}
      <article className="doc-page">
        <h2 className="doc-h">Finish Selections &amp; Allowance Schedule</h2>
        <p className="doc-lead">
          The budgets below are carried in the contract for the finishes you select. Make your selections within each
          budget — if a selection comes in over its allowance, the difference is added by change order (plus 12%
          overhead and profit), and any amount under is credited back to you. Use the right column to record your
          selection.
        </p>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Finish Item</th>
              <th className="n">Budget Allowance</th>
              <th>Your Selection</th>
            </tr>
          </thead>
          <tbody>
            {finishGroups.length ? finishGroups.map((group) => (
              <FinishGroupRows key={group.category} group={group} />
            )) : (
              <tr><td colSpan={3}>No selection-dependent finishes on this estimate.</td></tr>
            )}
          </tbody>
          {finishGroups.length > 0 && (
            <tfoot><tr><td>Total allowances carried</td><td className="n"><b>{money(allowanceTotal)}</b></td><td /></tr></tfoot>
          )}
        </table>
        <p className="line-detail" style={{ marginTop: 14 }}>
          Allowances are included in the contract price and reconciled to your actual selections at the time they are
          made. Over-allowance selections are billed by signed change order at cost plus 12%; under-allowance savings
          are credited in the final payment.
        </p>
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
                <DivRow key={d} name={d} sum={g.sum} lines={g.lines} total={dispTotal} show={showLines} />
              );
            })}
          </tbody>
          <tfoot>
            <tr><td>MS sales tax ({taxPct || 0}%)</td><td className="n">{money(tax)}</td></tr>
            <tr className="grand"><td>Total estimated investment</td><td className="n"><b>{money(grand)}</b></td></tr>
          </tfoot>
        </table>

        {milestones.length > 0 && (
          <div className="pay-sched" style={{ margin: "22px auto 0 0", maxWidth: 420 }}>
            <div className="doc-sub">Payment schedule</div>
            {milestones.map((m, i) => (
              <div className="pay-row" key={i}>
                <span>{m.label}</span>
                <span className="pay-pct">{m.pct}%</span>
                <b>{money(grand * (m.pct / 100))}</b>
              </div>
            ))}
          </div>
        )}

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

function FinishGroupRows({ group }: { group: FinishGroup }) {
  return (
    <>
      <tr className="div-sum">
        <td>{group.category}</td>
        <td className="n">{money(group.total)}</td>
        <td />
      </tr>
      {group.items.map((item, i) => (
        <tr key={i} className="sub-line">
          <td>&nbsp;&nbsp;{item.description}</td>
          <td className="n">{money(item.amount)}</td>
          <td><span style={{ display: "block", borderBottom: "1px solid #d0d5dd", minHeight: 16 }} /></td>
        </tr>
      ))}
    </>
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
