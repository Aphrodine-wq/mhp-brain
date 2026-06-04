# Margin Guard — never undercharge again

*Goal: a system that answers one question continuously — **are we charging enough?** — and catches an
undercharge at every point it can happen: before the bid is sent, while the job runs, and at close so
it never repeats. It sits on top of the actuals pipe and the price sensor; it is the brain on top of
the data, not new plumbing.*

Capstone of the money system. Companions: `QB_JOBCOST_SPEC.md` (cost + provenance),
`WIRING_QUICKBOOKS.md` (the two intake pipes), `PRICE_SENSOR.md` (live catalog).

---

## Undercharging is three failures, not one

A system that catches only one of these still bleeds from the other two:

1. **The thin bid** — a rate quoted below true cost + real margin. Stale prices, forgotten scope, or
   markup applied to a too-low base. The loss is baked in before the first nail.
2. **The silent overrun** — the bid was fine, execution blew past it, and nobody repriced or billed a
   change order. The job quietly earns less than it sold for.
3. **The hidden overhead** — gross margin looks healthy, but after office, insurance, trucks, and
   admin pay, net is negative. Busy and broke. The contractor classic.

Margin Guard closes all three: Engine 2 (Bid Guard) kills #1, Engine 3 (Margin Radar) kills #2,
Engine 1 (Floor) + the net layer kill #3.

### The near-free lever: markup is not margin

A 20% markup is a 16.7% margin. "I add 20%, so I make 20%" is wrong, and it undercharges ~3 points on
every job. Margin Guard **always** speaks margin (computed correctly) and shows the markup that hits
it — on *loaded* cost (direct + overhead), not bare direct cost. Fixing this one confusion is the
cheapest margin recovery available.

---

## Decisions, locked (2026-06-04)

1. **Gross + Net.** Track job-level gross AND net after a fair slice of overhead. Net is what catches
   "busy and broke." Gross is the default headline; net is a clearly-separated second layer (per
   `QB_JOBCOST_SPEC.md`).
2. **The floor is computed, the target is set.** The system derives the break-even markup from MHP's
   own actuals (the line below which a job nets a loss). James sets the target *above* that floor.
   Grounded in reality, not a rule of thumb.

---

## The metric everything reports: the Margin Ladder

No job or bid ever shows a single margin number — that is exactly how a net-negative job hides behind
a healthy gross. Every bid and job carries three, stacked, each against its target:

| Rung | Formula | Catches |
|---|---|---|
| **Gross** | revenue − direct cost (material + labor + sub) | the thin bid / overrun |
| **Net** | gross − allocated overhead | busy-and-broke |
| **Cash** | collected − paid | retainage / draw-timing illusions |

Markup and margin are shown side by side, always, with the conversion. Target is set as a margin; the
system back-calculates the markup that achieves it on loaded cost.

---

## Engine 1 — The Floor (break-even, computed from your data)

```
overhead_rate   = annualized overhead $ / annualized direct cost $     # from the QB overhead pool
loaded_cost     = direct_cost * (1 + overhead_rate)
breakeven_markup= the markup on direct cost where net margin = 0       # below this, the job loses money
floor_margin    = breakeven expressed as a margin
target_margin   = James's number, set above floor_margin               # the only input here
```

Overhead is the genuine office/insurance/truck/admin spend — the QB **untagged-but-overhead pool**
(`QB_JOBCOST_SPEC.md` surfaces it; this classifies it). Recompute monthly, recency-weighted, min-N
gated so one slow month doesn't move the floor.

**The non-obvious payoff:** as volume grows, fixed overhead spreads over more jobs, so the floor
*drops* — MHP can bid more competitively without undercharging. The system tracks the floor moving
instead of anchoring to last year's number.

---

## Engine 2 — The Bid Guard (catch it before send)

Runs on every estimate before it leaves the building. Five checks:

1. **Freshness** — each line priced off the live catalog (`PRICE_SENSOR.md` component EWMA); flags
   lines riding stale data. "82% of this bid is fresh-priced."
2. **Below-cost lines** — any line bid under today's real cost. The classic undercharge, caught at the
   line level.
3. **Floor check** — the whole bid's net margin vs floor and target. "Nets 9%, floor is 14% — loses
   money before you start."
4. **Missing-scope detector** — compares this bid's line composition to similar closed jobs (same
   type/market). "Your last 5 kitchens all had demo and electrical rough-in; this bid has neither."
   Catches the forgotten-scope undercharge by pattern.
5. **Markup sanity** — surfaces the margin the chosen markup actually produces.

Output: a **go / no-go with the exact dollars at risk** if sent as-is.

### The override that makes this MHP's, not generic SaaS

The Bid Guard does **not** hard-block a thin bid. MHP charges loyalty clients less *on purpose* — that
is a value, not a mistake (see the pricing-loyalty principle: underprice the people who earned it,
make money on strangers). So an under-floor bid takes a one-click override with a **reason code**
(`loyalty: Casey`). Two payoffs:

- the system stops nagging about a deliberate choice, and
- the Leakage Report **splits the number**: "undercharged $14k this quarter — $11k intentional
  (loyalty), $3k accidental." Only the $3k is a problem.

The floor is guarded without ever turning generosity into an error the system tries to correct.

---

## Engine 3 — Margin Radar (catch it during the job)

Live from the invoice feed (QB + email). Per active job, budget vs actual by CSI division. Alarms the
moment any division crosses its bid before the job is marked done — "framing bid $40k, you're at $52k
and not finished." Progress proxied by dollars (actual ÷ estimated total), so it works with zero data
entry. The alarm **escalates** when an overrun pushes the job's net below the floor — distinguishing
"over budget" from "now losing money." (Formalizes Margin Radar from `ROADMAP.md` Part 6.)

---

## Engine 4 — The Post-Mortem (so it never repeats)

At job close, the realized Margin Ladder vs the bid feeds two loops:

- **Catalog correction (the flywheel)** — the bid-vs-actual delta corrects the component rate (EWMA).
  The next bid prices off reality, not the old guess.
- **Pattern alarm (the real "never *again*")** — if a line beats its bid across multiple jobs, it
  flags a *structural* undercharge: "Framing has run over bid on 4 of the last 5 — your framing rate
  is systematically low. Raise it." One overrun is noise; a pattern is a leak.

---

## The one screen: the Scoreboard

- **Active jobs** — Margin Radar live, each with its three-rung ladder vs target, alarms surfaced.
- **Portfolio roll-up** — company-wide net margin vs target this quarter. Are we clearing the floor?
- **The Leakage Report** — the visceral view: total dollars left on the table this period, itemized by
  cause (bids below floor · overruns never billed as change orders · jobs closed under target) and
  split intentional vs accidental. The bleed as a number you can act on.

---

## Data + provenance

Everything rides on what is already speced — no new upstream plumbing:

| Need | Source |
|---|---|
| direct cost + revenue per job | `actuals_txn` (QB + email pipes, `WIRING_QUICKBOOKS.md`) |
| live line prices | `unit_costs` / `price_observations` EWMA (`PRICE_SENSOR.md`) |
| overhead pool | QB untagged-but-overhead, classified (`QB_JOBCOST_SPEC.md`) |
| bids | `estimates` / `line_items` (the existing brain) |

Every figure traces to a QB transaction-id or an invoice message-id. Margin Guard is analysis with
provenance — a lens, not an authority (the legal framing from `QB_JOBCOST_SPEC.md` holds here too).

---

## The inputs that stay James's (not the system's to guess)

1. **Target net margin** — set above the computed floor.
2. **Overhead classification** — confirm which QB transactions are true overhead vs misfiled job cost.
3. **Change-order policy** — what counts as billable scope creep.

The system computes everything else and recommends starting points.

---

## Build order

1. **Floor Engine** — defines "enough." Needs the overhead pool classified + actuals flowing.
2. **Margin Ladder + Scoreboard read-views** — once actuals land.
3. **Bid Guard** — needs the live catalog + the floor.
4. **Margin Radar** — needs the invoice feed live.
5. **Post-Mortem flywheel** — needs job-close detection.
6. **Leakage Report** — last; it aggregates everything above.

Each engine is a separate, reversible switch. None of them changes a price or a book — Margin Guard
only reads, scores, and warns.

---

*The honest promise: every bid checked against a floor computed from your own costs, every active job
watched against its budget live, every closed job teaching the next, and a single number showing what
undercharging cost you this quarter — split between the gifts you meant to give and the money you left
on the table by accident. Last written 2026-06-04.*
