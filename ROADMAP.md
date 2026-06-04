# MHP Brain — Roadmap & Vision

*The operating system for North Mississippi Home Professionals. The estimating brain that prices
the work, fused with the tools that run the company. Built on every job MHP has ever done.*

This is a living document. It captures where the system is, where it's going, and the order to
build it in — so nothing gets lost and every decision is made on purpose.

---

## Why this exists

MHP is a family company — Rick, Brock, Walt, and the team. A tool that makes the company run
better makes their lives better directly: fewer fires, fewer late nights, more money kept, more
time at home. That's the bar. Not "software," but **a system that gives the family back their
evenings and protects the money they've earned.**

The unfair advantage no off-the-shelf tool (Procore, Buildertrend, CoConstruct) can match: those
are record-keepers built on *your typing*. This is built on **MHP's own 149-job history** — a
pricing brain that knows what MHP actually charges, wins, and bleeds on. That data is the moat.

---

## Where we are today (built, working, local)

- **Data pipeline** — `extract → normalize → refine` over 13 GB / 149 jobs. 88% of estimates parse
  clean into structured line items (4,298 of them).
- **Pricing brain** — a CSI-keyed unit-cost catalog (223 normalized rates) from real history.
  Framing labor $7.25/sqft, etc. — MHP's actual numbers, not RSMeans averages.
- **Estimation engine** — describe a job → seeded editable estimate → exports a **native MHP .xlsx**
  with the real template formulas intact. Reprice mode flags where a job is priced off your norm.
- **Web app** (`localhost:8770`) with: Home (command center), **Estimates** (live preview),
  **Projects** (162 jobs, real status + value), **Subs** (101, real roster), **Crew** (7, real
  directory), **Live** (predictive job health), **Settings**, user profile.

**Honest state:** this is a strong prototype, not shippable SaaS yet. It's local, single-user, no
login, read-only (can't be corrected), and the invoice/actuals pipe isn't wired. Getting it in
front of the team daily means hosting, auth, and write-back. See "What it needs to be real."

---

## North Star — three layers

1. **The Estimating Brain** — prices new work off real history, gets sharper as actuals flow in.
2. **The Company Cockpit** — projects, subs, crew, clients, documents, money — one place.
3. **The Foresight Layer (Live)** — looks *forward*: predicts margins, warns before jobs break,
   derives the day's priorities. The thing nobody else has.

---

## Part 1 — The CEO's cockpit (Rick's life)

A construction CEO's real pain: finds out about problems *after* they cost money, is buried in
detail when he needs one-glance clarity, and is blind on **cash timing** (contractors die from cash
timing, not lack of profit). Everything here attacks those three.

- **Morning cockpit** — one screen tuned to a CEO's questions: what closed, what's at risk, what
  needs my decision, money in vs out this week.
- **Margin truth, per job** — which jobs are actually making money, live, while there's still time
  to fix the dogs. (Needs actuals.)
- **Cash-flow choreography** — draws coming in vs sub payments going out across *all* jobs. "You're
  tight the week of the 15th." No contractor tool does cross-job cash well. (Needs actuals.)
- **Bidding advisor** — new lead → win-probability + expected margin + crew-capacity fit. Stops
  chasing unprofitable work and losing good work on price.
- **Exception alerts to his phone** — text only when it matters: big bid won, job over budget, sub
  no-show, permit expiring. Push, not pull.
- **Ask the business** — "how's Lachlan doing," "what's our backlog" → straight answer, no clicking.
  (ConstructionAI is the brain.)
- **Delegation visibility** — see what Josh and Jason are running without a meeting.

---

## Part 2 — Tools for the whole team (data we already have)

- **Clients / CRM** — 148 homeowners with contacts and project history. The missing half. No new
  data needed.
- **Documents** — every contract, estimate, and photo per job, searchable from the job card.
- **Job photos** — 3,200 images, before/after galleries. Doubles as the marketing reel.
- **Proposal PDF** — one button on an estimate → client-ready proposal on MHP letterhead.
- **Win-rate analytics** — 126 dead vs 23 active is a goldmine: which types/sizes/markets you win.
- **Crew assignments** — put faces on active jobs; see capacity.
- **Estimate templates library** — save common scopes (kitchen, bath, deck) as one-click starts.

---

## Part 3 — The Foresight Layer (Live, expanded)

Already seeded in the **Live** tab. Three engines, all powered by MHP's own history:

1. **Margin Radar** — predicts each job's *final* margin before it's done, from your historical
   drift. (Live forecast activates when actuals connect.)
2. **Risk Immune System** — pattern-matches active jobs against past problem jobs (the incident log)
   and warns on the early markers. "3 of the 5 signs that preceded your worst overruns."
3. **The Derived Day** — the priority feed writes itself from state: stale estimates, bids unsigned,
   permits expiring, jobs priced under norm. (Working today on bid pricing + activity.)

---

## Part 3.5 — Keeping prices current (real-time materials)

A bid is only as accurate as its prices, and **material prices go stale fast** while **labor stays
stable**. The fix is to split every line and treat the two halves differently.

- **Labor** (your crews, your subs) — MHP-specific, drifts slowly. **History is good here.** Keep it.
- **Material** (lumber, concrete, drywall, copper) — external and volatile. **Needs to be current.**

**Current-price sources, best to worst:**
1. **Your own recent invoices (QuickBooks)** — what MHP actually paid last month. Real, negotiated,
   current. Recency-weighted (EWMA) so recent purchases dominate. *Real-time pricing is a payoff of
   the actuals pipe — another reason QuickBooks is integration #1.*
2. **The price scraper (already exists & proven on MHP's materials)** — `~/Projects/ftw-scraper/`
   has run daily since **2026-05-07** (~21,745 price snapshots), Google Shopping multi-merchant
   (30-42 sources), normalized, **geolocated to Oxford (38655)**, output in `data/prices/`. It has
   **already scraped MHP's cost drivers** — lumber, concrete, drywall, insulation, roofing (May 7),
   cabinets/countertops (May 15) — SKUs configured and validated. It just **rotates categories** each
   run, so no continuous per-material trend yet. **Fix is small:** lock the tracked list to MHP's full
   material mix and run daily → a fresh Oxford price per line every morning. Consume its output files
   (don't entangle with ftw-svc). **DONE:** `config/mhp-materials.json` (20-material basket) +
   `scripts/scrape-mhp.js` (writes `data/prices-mhp/`) + launchd `com.mhp.priceupdate` scheduled
   Mon/Wed/Fri 9:30am. **Reliability caveat:** free Google scraping hits CAPTCHA intermittently
   (first manual run was blocked). Scheduled runs will land partial; **a paid scrape API (~$30-50/mo)
   is the production fix** when material pricing becomes load-bearing for bids.
3. **Material/commodity index** — a macro nudge to fill the gaps.

**Connect via drift, not swap.** MHP prices materials as a *blended* rate ($8.90/sqft framing), not
per-SKU. Use the feed as an index: "lumber +9% this month → nudge the framing material rate +9%."

**Mechanism for accurate bids:**
- Each material rate carries a **freshness stamp** (last price + date).
- Engine prices **materials at today's cost, labor at your norm.**
- **Drift alerts on open bids:** "lumber up 12% since the Eaton estimate — outstanding bids may be
  underpriced." Catches the bid that quietly went underwater while it sat in a client's inbox.

**Owner:** Sandi Woods (Materials Specialist) keeps current prices fed and confirmed — the human in
the loop. The material/labor split already exists in the extracted data; today we aggregate on the
total, so separating it is a contained change.

---

## Part 4 — Integrations, in order of leverage

1. **QuickBooks — the master key.** Cash flow, margins, what's owed to/by. Every dollar-based
   feature depends on it. One integration lights up the whole financial cockpit. **Start here.**
2. **Bank feed (Plaid)** — real-time cash position to pair with QB.
3. **Calendar (Google)** — draws, permits, deadlines → time-aware priorities + morning brief.
4. **SMS / push (Twilio)** — the exception-alert delivery layer. Gets the CEO off the desk.
5. **Email (Gmail)** — invoices/estimates in, proposals out. Kills inbox archaeology.
6. **OneDrive / SharePoint live sync** — keeps data fresh automatically; closes the snapshot gap.
7. **ConstructionAI** — the brain for ask-the-business + smart estimating (reads prose AND plans).

---

## Part 5 — Build sequence

1. **Write-back** (internal, cheap) — make the data correctable: mark a job Done, override status,
   confirm a sub, dismiss a flag. Fixes the "Jan Knight looks active but isn't" class of problem.
   Turns the app from a mirror into a tool.
2. **Hosting + login** — get it off localhost so the team can actually use it daily.
3. **QuickBooks** — connect actual costs. The moment this lands, margins + cash flow + half the CEO
   cockpit turn on at once.
4. **Mobile + alerts** — the field and the CEO's phone.
5. **ConstructionAI assistant** — ask-the-business, smart estimate parsing.
6. **The rest** — Clients, Documents, Photos, win-rate, proposals — slot in as the platform matures.

---

## Part 6 — The Actuals Loop (tracking + the flywheel)

The invoices in the company's accounting inbox are the highest-value data MHP owns. They arrive at a
**dedicated business address first**, then get keyed into QuickBooks. That makes the inbox the front
door for money-in and the system's natural home: it reads invoices live, and QuickBooks confirms each
one got booked (a free audit — "this bill hit the email but isn't in QB yet"). One pipe feeds two
payoffs.

**Payoff 1 — Track actuals vs where the job is (live).**
One card per active job: **budget vs actual, by CSI division.** For each division — what it was bid at,
what's been invoiced against it so far, and the gap. The gap *is* the signal: "framing bid $40k,
you're at $52k and not done." Progress is proxied by **dollars, not calendar** — actual ÷ estimated
total — so it needs zero data entry to work day one. The alarm that matters: any division crosses its
estimate before the job is marked done. That's Margin Radar, and it falls out of the invoice feed for
free. (Optional later: let someone mark "framing done" to sharpen % complete from "budget burned" to
true progress.)

**Payoff 2 — Each job teaches the next (the flywheel).**
When a job closes you have both numbers: what you **bid** and what it **actually cost**. The delta is
the lesson. At close, the system feeds that delta back into the catalog: bid framing at $7.25/sqft but
the last five jobs really ran $8.10 → the rate corrects itself, **recency-weighted (EWMA)** so recent
jobs dominate. Every rate starts carrying a record — *bid $X, actual $Y, across N jobs, confidence
band tightening.* The next addition is priced off what your last additions actually cost, not a guess.
This is the moat compounding, and the thing Procore/Buildertrend structurally can't do — they price
off your typing; this prices off your reality.

**The guard (don't learn from noise).** A missing or unreadable actual must never silently corrupt a
catalog rate. If the actual isn't available — e.g. trapped in a scanned PDF, or the job isn't closed —
the loop **holds** and flags the job as awaiting actuals. Bad data corrupts the moat; the loop only
learns from confirmed, matched actuals (exact/high confidence). Weak matches go to a review queue, not
the catalog.

**Schema is already shaped for it:** `estimates` (the bid, per-division `line_items`), `actuals`
(`closing_total`), `unit_costs` (the rates that get corrected). The invoice pipe is the missing input
that turns tracking, Margin Radar, and the flywheel on at once. See `test_actuals_loop.py` for the
loop proven on two real jobs (Jooste closes; Moore is correctly held pending invoice ingestion).

---

## What it needs to be real (honest list)

- **Auth + multi-user** — Rick, Josh, Jason, Walt, Sandi with the right access.
- **Hosting** — off localhost, backed up, reachable from the field.
- **Write-back + an audit trail** — corrections stick, and you can see who changed what.
- **The actuals pipe** — QuickBooks. Without it the predictive layer stays "locked."
- **Fresh data** — live OneDrive sync, not a May snapshot.
- **A few data-quality cleanups** — e.g. mis-filed estimates (a kitchen estimate landed in the Mason
  ADU folder during the original sort). Worth a human pass on the active jobs.

---

## A note on what this is worth

For MHP, this should be near-free — Josh and the family are the design partners whose data *is* the
product. The real revenue is the second sale: this same shape, sold to the next Mississippi
contractor at fair SaaS rates. Underprice the people who earned it; make money on strangers. (Final
numbers are James + Mason's call.)

---

*Last updated 2026-06-03. Owner: Walt Burge. Built with the Burge family in mind.*
