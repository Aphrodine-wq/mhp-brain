# QuickBooks Job-Cost Spec — defensible per-job profit/loss

*Goal: from QuickBooks, produce a per-job profit-or-loss number for every MHP project that is
accurate enough to run the company on — and traceable enough that an accountant or attorney can
verify each figure against source records.*

This is the integration that answers "which jobs did we lose money on, and by how much." It cannot
be answered from bid data — every job was bid with margin; losses happen in execution, and execution
lives in QuickBooks. See `ROADMAP.md` Part 6 (the actuals loop) for how this feeds the flywheel.

> **Legal framing, stated once and meant throughout:** this system produces an *analysis with
> provenance* — every number traces to QB transaction IDs. It is a lens, not an authority. Any figure
> used in litigation must be verified by MHP's accountant/attorney against QuickBooks, signed
> contracts, and bank records. The determination is theirs; the system's job is to make it fast,
> complete, and auditable.

---

## What "lost money on a job" actually means — define it before computing

There are three different "profit" numbers, and a litigation context needs the right one named:

1. **Gross job margin** = job revenue − *direct* job cost (materials, subs, direct labor). What most
   contractors mean by "did this job make money."
2. **Net job margin** = gross − an allocation of *overhead* (office, insurance, trucks, admin pay).
   A job can be gross-positive and net-negative.
3. **Cash position** = collected − paid on the job (ignores retainage/unbilled). Different again.

**Default for this build: gross job margin**, with overhead allocation as a clearly-separated second
layer. Every report states which definition it's using. A "loss" is only called when the chosen
definition is satisfied *and* the cost data is complete (below).

---

## The QuickBooks data model we depend on

| QB entity | Role | Notes |
|---|---|---|
| **Customer : Job** (sub-customer) | the project entity | the linchpin — costs/revenue tag here |
| **Bill, Purchase, VendorCredit** | direct cost (payables, expenses) | the bulk of "what it cost" |
| **Invoice, Payment, SalesReceipt** | revenue (what the homeowner paid) | revenue side of the P&L |
| **TimeActivity / Employee** | labor cost | **often absent — see the labor trap** |
| **Item / Account** | cost categorization | map to CSI divisions for line-level variance |
| **PurchaseOrder** | committed (not-yet-billed) cost | for live in-progress jobs |
| **Reports API: ProfitAndLossDetail (by Customer)** | QB's own job P&L | cross-check our roll-up |

The reliability of everything downstream depends on **whether transactions are tagged to a
Customer:Job.** Tagged → near-automatic. Untagged → inference (see Phase B).

---

## The accuracy traps (these decide whether the number is trustworthy)

1. **Labor — the #1 trap.** If MHP runs payroll *outside* QuickBooks (a separate payroll service,
   cash, or 1099 subs booked as bills), then QB job-cost **understates cost and overstates margin** —
   sometimes massively. A job that looks +12% can be a loss once real labor lands. **Every job P&L
   must declare whether labor is included**, and if not, the margin is marked *gross-of-labor /
   incomplete*, never reported as a confirmed result. Resolving labor allocation is prerequisite to
   any loss claim.
2. **Untagged costs.** Bills not assigned to a job sit in general overhead — some genuinely are,
   some are misallocated job costs. We surface the untagged pool, never silently drop it.
3. **Overhead vs direct.** Don't let unallocated overhead masquerade as job cost or vice versa. Keep
   the two layers explicit.
4. **Timing: accrual vs cash, retainage, open draws.** A job mid-draw looks underwater because
   revenue lags cost. Only **closed** jobs get a final P&L; open jobs are "in progress — partial."
5. **Data-entry consistency.** Depends on the bookkeeper. The completeness score (below) makes this
   visible instead of hidden.

---

## Per-job P&L — the computation

For each Customer:Job:

```
revenue      = Σ Invoice/Payment/SalesReceipt   (tagged to job)
direct_cost  = Σ Bill + Purchase − VendorCredit  (tagged to job)
             + Σ labor            (TimeActivity, or allocated payroll — flagged if absent)
gross_margin = revenue − direct_cost
gross_pct    = gross_margin / revenue

bid          = matched MHP estimate (sov_total)          # from mhp.db
bid_vs_actual= actual_cost vs bid_cost  +  actual_margin vs bid_margin
```

**Completeness score** (0–100) per job — the defensibility gate:
- cost lines tagged to job vs floating · labor present yes/no · job closed yes/no ·
  revenue reconciles to contract value (±tolerance) · revenue reconciles to bank deposits.

A job is reported as **CONFIRMED LOSS** only at high completeness *with labor included*. Otherwise:
**LIKELY LOSS (labor unconfirmed)**, **INCOMPLETE — UNDER REVIEW**, or **IN PROGRESS**. No job is
ever flatly called a loss off partial data — especially not for legal use.

---

## Mapping QB jobs ↔ mhp-brain projects

The bridge between QuickBooks and the brain's 149 projects:
- **If tagged:** fuzzy-match QB Customer:Job name → `projects.id` (the existing `slug()`); confirm on
  address/client. A review queue for ambiguous matches (and we already know the data is mis-filed —
  e.g. Molly Moore under Ken Williams — so human confirmation is built in, not optional).
- **If untagged:** route the transaction through the existing matcher, `qb-job-matching.ts`
  (PO → client/address → vendor → date-window, confidence tiers). exact/high auto-assign; the rest to
  the review queue. *Reuse this — don't rebuild it.*

---

## Connection & security

- **QB Online API, OAuth2, READ-ONLY scope** (`com.intuit.quickbooks.accounting` read). We never
  write to MHP's books — eliminates the risk of corrupting the records this very analysis depends on.
- Tokens stored encrypted; refresh handled; **never committed** (gitignored, like `mhp.db`).
- Incremental sync via **ChangeDataCapture** or `Metadata.LastUpdatedTime` — pull deltas, not the
  whole company each run.
- **Audit log** of every pull (what, when, how many records) — provenance for the legal framing.
- **Spine note:** the matcher is TypeScript (archived `mshomepros`); `mhp-brain` is Python. This
  integration forces the `COMPANY.md` spine decision. The same QB OAuth is being built for
  FairTradeWorker right now — build the connection once, share it. (Python: `intuit-oauth` +
  `python-quickbooks`; or stand the TS matcher up as a tiny service.)

---

## Build phases

- **Phase A — Connect + map.** OAuth read-only; pull the Customer:Job list; reconcile to the 149
  projects with a human-confirmed match queue. Deliverable: every QB job ↔ project, or flagged.
- **Phase B — Pull + tag.** Bills/invoices/payments (+ labor source resolved); tag to jobs (direct or
  via matcher); land in `actuals` with transaction-ID provenance.
- **Phase C — Compute + score.** Per-job gross P&L, completeness score, labor-included flag,
  bid-vs-actual. Overhead allocation as a separate, optional layer.
- **Phase D — The report.** Per-job P&L with source references, sorted to the losses first, each
  carrying its confidence tier. Portfolio roll-up. Cross-check against QB's own
  ProfitAndLossDetail-by-Customer report (two independent paths agreeing = defensible).

---

## What James needs to provide to start

1. QuickBooks Online access (admin can authorize the app, or an accountant-user, read-only).
2. **The labor answer:** is payroll *in* QuickBooks, or run elsewhere? This single fact determines
   whether the cost side is complete on day one.
3. Whether the bookkeeper tags bills to Customer:Job (decides Phase B effort).
4. For litigation specifically: the signed contract values and any bank records the accountant wants
   cross-checked — so the system reconciles to them, not just to QB.

---

*The honest promise: once QuickBooks is connected and the labor source is resolved, this produces a
per-job profit/loss across the whole book — every figure traceable to a QB transaction, every loss
gated on completeness. Accurate enough to run on; auditable enough to verify. Last updated 2026-06-03.*
