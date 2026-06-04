# Tomorrow — Get QuickBooks Connected (see the real numbers)

The goal: connect MHP's QuickBooks read-only so the system can pull real per-job cost and produce
the profit/loss numbers. Most of this is ~1 hour of your time; once I have access, the build is mine.
Full plan lives in `QB_JOBCOST_SPEC.md` — this is just the do-list.

---

## STEP 0 — the one question that decides the whole path  ⬅ check this first

- [ ] **Is MHP on QuickBooks _Online_ or QuickBooks _Desktop_?**
  - **Online** → everything below applies. Clean API path. Go.
  - **Desktop** (Contractor/Premier installed on a PC) → *stop and tell me.* No cloud API; we go a
    different route (QB Web Connector, or you export the job-cost reports and I ingest those). Don't
    do the developer-app steps — they won't apply.

*(Quick check: if your brother logs into QuickBooks in a web browser, it's Online. If it's an app
installed on a specific computer, it's Desktop.)*

---

## STEP 1 — who has the keys

- [ ] Find out **who is the QuickBooks admin** for MHP's company. Your brother enters the bills, so
      it's likely him or the accountant. You need an admin (or accountant-user) to authorize the
      connection — read-only, so it's safe, but it has to be someone with access.
- [ ] Give them a heads-up you'll need ~10 minutes of their time to click "Authorize."

---

## STEP 2 — create the Intuit app (James, ~20 min)

- [ ] Go to **developer.intuit.com** → sign in with the Intuit account.
- [ ] **Create an app** → choose the **Accounting** scope.
- [ ] Use **Production** keys (not just sandbox) — sandbox is fake data; you want real numbers.
      Connecting your *own* company doesn't require Intuit's app-store review, so production keys
      work directly.
- [ ] Set the **Redirect URI** to: `http://localhost:8771/callback`
- [ ] Copy the **Client ID** and **Client Secret** somewhere safe (NOT into git, NOT a text on your
      phone — hand them to me in the session and I'll keep them out of the repo).

---

## STEP 3 — connect (James + me, ~10 min, together)

- [ ] Hand me the **Client ID + Client Secret**.
- [ ] I run the OAuth helper; it opens a QuickBooks "Authorize" page.
- [ ] The QB admin clicks **Authorize** (read-only) for MHP's company.
- [ ] Intuit returns the tokens + the company ID (realmId). I store them encrypted, gitignored.
- [ ] **We're connected.** From here it's my build.

---

## STEP 4 — two answers I'll need (the accountant/brother can tell us)

- [ ] **Does the bookkeeper tag bills to a Customer:Job** in QuickBooks? (Decides how much matching I
      do — tagged is nearly automatic; untagged runs through the matcher.)
- [ ] For the litigation: **which contract values / bank records** should the numbers reconcile
      against? Get those from the accountant so the P&L cross-checks to authoritative records, not
      just QB.

---

## What I do once connected (no action from you)

1. **Map** QuickBooks jobs → your 149 projects. I hand you the matches and the ones that don't line
   up (we already know some are mis-filed — Molly Moore under Ken Williams, etc.).
2. **Pull** bills, invoices, payments, and labor (payroll's in QB — confirmed — so cost is complete).
3. **Compute** per-job profit/loss with a completeness score on each.
4. **Hand you the loss list** — worst-first, every number traceable to a QB transaction.

That's the answer to "which jobs did we lose money on," for real, and the 2025 performance backfill,
and the live cockpit — all off this one connection.

---

## Realistic expectation for tomorrow

Tomorrow gets us **connected + the job-to-project map** (Step A). The full per-job P&L follows right
after — fast, because the matcher's already written and labor's already in QB. The blocker was never
the build. It's been getting me into the books. Tomorrow we do that.

*Created 2026-06-03 for tomorrow. Spine: build the connector in Python inside `mhp-brain` (reuses the
QB OAuth pattern from FairTradeWorker; MHP connects to its own company/realm).*
