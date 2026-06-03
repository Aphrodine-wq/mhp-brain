# MS Home Pros — The Whole Company

*Everything the company needs to run and grow — the business around the software. `ROADMAP.md`
plans the platform (the estimating brain + cockpit). This plans the **company** the platform serves:
how work gets won, how the company gets protected, and who actually logs in. The two are meant to be
read together.*

This is a living document. When a domain below gets built, link it back to the roadmap's build
sequence so the two stay in sync.

---

## Who this is for

MHP is **Mississippi Home Professionals, LLC** (DBA North Mississippi Home Professionals) — a family
construction company out of Oxford, MS. Ricky D. Burge (CEO), Josh Harris on license (R21909), and
the team. The bar is the same one the roadmap sets: not "software," but **a system that gives the
family back their evenings and protects the money they've earned.**

The software is becoming the company's operating system. This document makes sure we build the
*company's* needs on purpose, not just the app's.

---

## The decision that gates everything: one spine

MHP currently has two platforms that overlap, and a company cannot run on two:

- **`mhp-brain`** (this repo, live on `localhost:8770`) — built on MHP's **real 149-job history**.
  The data moat. Rough but true. The roadmap bets on this.
- **`mshomepros`** (archived to `~/Projects/_archive/`) — Next.js SaaS, 629 tests, polished, but
  built on typed-in data, not history. The pretty mirror.

**Recommended call (James + Mason's to confirm):** `mhp-brain` is the spine. The archived SaaS
becomes a **parts donor** — we lift its proven, already-built pieces onto the brain rather than
rebuild them: auth + roles, QuickBooks OAuth, PDF proposals/contracts, the client portal, daily logs,
change orders, schedule view, sub manager. Most of "Run the work" below already exists over there.

Second life for the SaaS code: it's the **multi-tenant skin for the second sale** (see last section).
Nothing is wasted — single-tenant brain for MHP, multi-tenant shell for stranger #2.

---

## Everything the company needs, by domain

Status tags: `[have]` working · `[partial]` started · `[gap]` missing · `[decide]` needs a call.

### 1. Get the work — sales, brand, web `[gap]`
The roadmap prices and runs work but barely touches *winning* it. A construction company lives or
dies on lead flow.
- **The website** — mshomepros.com / North MS Home Pros brand. This is the "rename to the website"
  thread: the platform should carry the company's real name, and the public site is the front door.
- **Lead intake** — a way for homeowners to reach the company that lands *in* the system, not a
  forwarded email.
- **The marketing reel** — 3,200 job photos already in hand. Before/after galleries double as proof.
- **Reputation** — Google Business Profile, reviews, the win-rate analytics turned outward ("we win
  kitchens, we bleed on additions" → bid and market accordingly).

### 2. Price the work — the estimating brain `[have]`
Strongest piece. Covered fully in `ROADMAP.md` Parts 1–3.5. The moat.

### 3. Run the work — projects, field, scheduling `[partial]`
Projects / Subs / Crew exist as **read-only mirrors**. They become tools with write-back (mark a job
done, confirm a sub, assign crew), plus scheduling, daily logs, and change orders. **Most of this is
already built in the archived SaaS** — lift, don't rebuild.

### 4. Handle the money — QuickBooks first `[gap — the master key]`
Integration #1 in the roadmap, and the single highest-leverage thread in the company. Until it lands,
half the cockpit stays locked: real per-job margins, cross-job cash timing, current material prices,
payroll, what's owed to and by. **Cross-portfolio note:** the same QuickBooks OAuth + invoicing work
is a live P0 on FairTradeWorker right now. Build the integration once, use it both places.

### 5. See the work — foresight cockpit `[have, locked]`
Margin Radar, Risk Immune System, the Derived Day. Designed and seeded in the **Live** tab; switches
on the moment actuals (QuickBooks) connect. Covered in `ROADMAP.md` Part 3.

### 6. Protect the company `[gap — missing entirely]`
Nothing in the roadmap covers this, and a real company can't operate without it:
- **Backup + durability** — the moat is currently a single SQLite file (`mhp.db`). One bad disk and
  149 jobs of pricing history is gone. This is the most urgent non-feature on the list.
- **Contracts & lien waivers** — generated, tracked, signed.
- **Insurance / COI tracking** on subs; **license R21909** renewal; **permit deadlines**.
- **Audit trail** — who changed what, once write-back exists.

### 7. The people — auth, roles, devices `[gap]`
Rick, Josh, Jason, Walt, Sandi — each with the right access. Off localhost, reachable from the field
on a phone. The roadmap's "What it needs to be real" list; called out here because *who logs in* is a
company question, not a code detail.

### 8. Make it real — hosting, mobile, reliability `[gap]`
Hosting off localhost, backed up, mobile-friendly, dependable enough that the team trusts it daily.

### 9. The second sale — productize for the next contractor `[future]`
The same shape, sold to the next Mississippi contractor at fair SaaS rates. For MHP this is near-free
(the family's data *is* the product); the revenue is stranger #2. This is the Strata Software Group
business case, and the reason the archived SaaS code stays alive as the multi-tenant skin. **Final
pricing is James + Mason's call** — underprice the people who earned it, make money on strangers.

---

## Cross-portfolio leverage (own it, don't rebuild it)

- **ConstructionAI** — the brain for "ask the business" and reading plans, not just prose.
- **ftw-scraper** — already scraping Oxford-geolocated material prices; roadmap Part 3.5 has it wired
  (`com.mhp.priceupdate`, Mon/Wed/Fri).
- **FTW's QuickBooks work** — same OAuth/invoicing integration being built for FairTradeWorker now.

---

## Build sequence (company layer over the roadmap's software layer)

The roadmap's Part 5 sequence is right for the *platform*. These are the **company** concerns to slot
in alongside it, in order of "the company breaks without it":

1. **Back up `mhp.db`** — today. Cheap, and it's protecting the entire moat. Non-negotiable.
2. **Pick the spine** (decision above) — unblocks every "lift from archived SaaS" move.
3. **QuickBooks** — the master key; lights up money + foresight at once. Reuse FTW's work.
4. **Write-back + auth + hosting** — turns the mirror into a tool the team can actually use.
5. **The website + lead intake** — start getting work *into* the system.
6. **Protect-the-company layer** — contracts, COI, permits, audit trail.
7. **The second sale** — multi-tenant skin, once MHP is running on it daily.

---

*Last updated 2026-06-03. Companion to `ROADMAP.md`. Owner: Walt Burge. Built with the Burge family
in mind.*
