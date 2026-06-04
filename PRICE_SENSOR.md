# Price Sensor — keeping estimates accurate at every corner

*Goal: turn the actuals pipe (QuickBooks + the invoice inbox) into a continuous price sensor, so the
cost catalog reflects what MHP is paying **right now**, not what it paid whenever the last job
happened to close. Estimates priced off this are current, context-aware, and honest about what they
don't know.*

Companion to `QB_JOBCOST_SPEC.md` (the cost data + provenance), `WIRING_QUICKBOOKS.md` (how the two
intake pipes connect), and `ROADMAP.md` Part 6 (the actuals loop + flywheel). This doc is the
estimating half of that loop.

---

## The core idea

Every invoice that lands — in QuickBooks as a `Bill`, or in the dedicated intake box as a forwarded
PDF — is a **fresh, dated, real price tag** on a material, a sub, or labor. Not a list price. Not a
scraped retail number. The price MHP *actually paid*, after its contractor discount, its vendor
account, its negotiated rate.

That is the moat, stated plainly: **MHP's own invoice history beats any public price feed for
estimating what a job will cost MHP.** No competitor has these numbers. Procore and Buildertrend
price off what a user types; this prices off what the company actually paid. So the strategy for
"keeping up with prices at every corner" is not to chase an external index — it's to mine the
invoice stream MHP already owns.

---

## Two decisions, locked (2026-06-04)

1. **Live updates, on every invoice.** The catalog updates the day an invoice arrives — not only when
   a job closes. Job-close still feeds the loop (it's the most complete data point), but waiting for
   it means learning about a lumber spike months after it mattered. Live + smoothed is the answer.
2. **Rates are split into material / labor / sub.** A blended "$7.25/sqft framing" hides whether
   lumber moved or the crew slowed down. Split, each component tracks independently.

These two reinforce each other (see *EWMA half-life*, below): the split is what makes the live update
**safe**, because each component gets its own reaction speed.

---

## Data model

### `price_observations` — the sensor log (new, append-only)

Every price point ever seen. Never overwritten — corrections are new rows, so the history reads
forever and every figure traces to its source.

```sql
CREATE TABLE IF NOT EXISTS price_observations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key    TEXT NOT NULL,        -- CSI item # + canonical desc — same key as unit_costs
  component   TEXT NOT NULL,        -- 'material' | 'labor' | 'sub'
  unit_price  REAL,                 -- amount / qty (NULL for lump observations)
  unit        TEXT,
  qty         REAL,
  amount      REAL NOT NULL,        -- raw line amount (for lump + audit)
  vendor      TEXT,
  market      TEXT,                 -- Oxford / Pickwick / unknown (from the matched job)
  source      TEXT NOT NULL,        -- 'invoice' | 'closeout' | 'estimate'
  source_ref  TEXT NOT NULL,        -- QB txn-id or email message-id — the provenance anchor
  obs_date    TEXT NOT NULL,        -- invoice/transaction date, NOT ingest date
  included    INTEGER NOT NULL,     -- 1 = feeds the rate; 0 = held (outlier/review)
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_price_obs_key ON price_observations(item_key, component, obs_date DESC);
```

### `unit_costs` — evolves from "median over all jobs" to per-component live rate

```sql
-- (extension) the catalog row is now keyed (item_key, component) and carries the recency-weighted rate
ALTER TABLE unit_costs ADD COLUMN component   TEXT;     -- 'material' | 'labor' | 'sub'
ALTER TABLE unit_costs ADD COLUMN ewma_price  REAL;     -- recency-weighted current rate
ALTER TABLE unit_costs ADD COLUMN n_obs       INTEGER;  -- observations behind it
ALTER TABLE unit_costs ADD COLUMN last_obs_date TEXT;
ALTER TABLE unit_costs ADD COLUMN freshness   TEXT;     -- 'fresh' | 'aging' | 'stale' (derived)
-- existing median + p25/p75 band columns stay — they remain the honest "what we've seen" range
```

Lump items (no clean qty/unit) flow the same way into `lump_costs`, keyed `(item_key, component)`.

---

## The flow, end to end

```
invoice lands (email PDF) or Bill syncs (QB)
  → actuals_txn          : the cost + provenance (per WIRING_QUICKBOOKS.md)
  → categorize line → component (material|labor|sub)   [the vendor map, below]
  → unit_price = amount / qty   (lump items skip this, go to lump_costs)
  → price_observations   : with vendor, market, obs_date, source_ref
  → OUTLIER CHECK vs current band:
        wild   → included=0, route to review queue   (cannot move the rate yet)
        clean  → included=1
  → recompute (item_key, component) EWMA over included observations
estimate.py
  → sums component rates into each line, stamps a freshness flag per line
nightly drift watch
  → today's EWMA vs 30 days ago; a big move lights up open bids that lean on that item
```

---

## EWMA half-life — why the split makes live updating safe

Each component gets its **own** exponential half-life — its own memory length:

| Component | Half-life (starting point) | Why |
|---|---|---|
| **Material** | ~30–45 days | Lumber, drywall, fixtures swing with the market. React fast. |
| **Labor** | ~6–12 months | Crew/sub rates barely move. One odd paycheck must not jerk the rate. |
| **Sub** | ~3–6 months | Between the two; sub quotes drift but not weekly. |

This is the payoff of splitting. A single blended rate forces one reaction speed onto two things that
move at totally different speeds — either labor whipsaws on material noise, or materials lag behind a
real spike. Split, each tracks honestly. **The split is the guard, not just the accuracy win.**

---

## The vendor map — the quiet workhorse

Invoices don't label themselves "labor." Component is inferred from three signals, in order:

1. **Vendor identity** — lumber yard → material, a sub LLC → sub, payroll → labor. *Dominant signal.*
2. **Line description** — keyword/CSI hints when a vendor sells across components.
3. **CSI division** of the matched estimate line.

The key property: **vendors are sticky.** Tag "Oxford Lumber Co = material" once and every future
invoice from them auto-categorizes. Categorization gets *more* automatic over time, not less — which
is what keeps live updating from turning into data-entry hell. Unknown vendors route to review on
first sight, then they're known forever.

---

## Context-aware pricing

Every observation carries `vendor`, `market`, and `obs_date`, so the estimate engine prices in
context, for free:

- **Market** — an Oxford job leans on recent Oxford prices, not a two-year-old Pickwick number.
- **Recency** — the EWMA already weights recent over old; `obs_date` (not ingest date) drives it.
- **Vendor** — surfaces who's cheapest on a given material when the spread is wide.

---

## Freshness — the estimate tells the truth about itself

Each catalog rate carries a freshness flag derived from `n_obs` + days since `last_obs_date`:

- **fresh** — invoiced recently and often (drywall, lumber). Tight band, trust it.
- **aging** — seen, but not lately. Usable, widening band.
- **stale** — last seen long ago or only once (a one-off custom fixture). Effectively a guess.

The estimate reports it: *"82% of this bid is priced on fresh data; these 3 lines are stale — get a
quote."* Honest about what it knows, and it points the estimator exactly where to sharpen the pencil.

---

## The forward kicker — drift alarm on open bids

Once prices update live, the alarm points at the **bid** stage, not just closed jobs (Margin Radar,
earlier). The nightly drift watch compares each item's EWMA now vs 30 days ago; a material that jumps
lights up every **pending estimate and open bid** that leans on it:

> "Lumber is up 15% in three weeks — these 3 unsent bids are now underwater. Reprice before you send."

This is the thing that catches the bid that quietly went underwater while it sat in a client's inbox.

---

## The guards — so this never backfires

Live updating means one bad number could move a rate, so the guards are not optional:

1. **Outlier rejection.** A price outside the current band is held (`included=0`) and reviewed before
   it can move the rate. A single weird invoice cannot hijack a line backed by 60 real ones — the
   catalog's existing dominant-unit logic already does this; the band check extends it to live data.
2. **EWMA smoothing.** No single observation sets the rate; it nudges it, weighted by recency.
3. **Minimum observations.** A `(item_key, component)` rate stays "stale/provisional" until it has
   enough clean observations to trust — it doesn't go "live" off one data point.
4. **Confirmed/matched only.** Only exact/high-confidence matched lines feed the catalog. Unparseable
   (scanned-PDF) or ambiguous invoices hold in the review queue — never silently corrupt a rate.
   *Bad data poisons the moat; the loop only learns from clean prices.* (`ROADMAP.md` Part 6 guard.)

---

## Build order

- **Phase 1 — Observe.** Land `price_observations` from the actuals pipe (read-only; no rate changes
  yet). Build the vendor map. Just watch and categorize — prove the prices are clean and well-sorted.
- **Phase 2 — Roll up.** Per-component EWMA into `unit_costs`, with the half-lives and the band-based
  outlier gate. Catalog now updates live, guarded.
- **Phase 3 — Price + flag.** `estimate.py` reads component rates and stamps freshness per line.
- **Phase 4 — Watch.** Nightly drift alarm on open bids and pending estimates.

Phase 1 is safe to run the day the pipes connect — it changes no rates, only observes. Each later
phase is a separate, reversible switch.

---

*The honest promise: estimates priced off what MHP actually paid, this month, from these vendors, in
this market — each line flagged for how fresh its price is, each price traceable to the invoice it
came from. The moat compounds with every invoice. Last written 2026-06-04.*
