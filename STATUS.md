# MHP Brain — What To Do (the clear board)

_Updated 2026-06-23. When you feel lost or behind, read THIS, not your gut. Three
buckets. Most of what feels "undone" is already in the first one._

## ✅ DONE — needs nothing (stop re-checking these)

- **All 6 integrations are code-complete**: QuickBooks, Gmail, Microsoft Teams,
  DocuSign, Google Business Profile, CompanyCam. The code is written.
  (Trello was removed from the app — UI, API routes, lib, OAuth provider entry.)
- **GBP reviews display** (`ReviewsPanel`) — built; lights up automatically on first sync.
- **Per-job P&L pipeline, daily logs, change orders, estimates, catalog** — built.
- **Time tracking Phase 1 — the spine** — DONE (2026-06-23); **foreman hour-entry
  UI since removed** (the `/time` form, `/api/time` route, and `lib/time.ts` were
  deleted — hours now come in via the BusyBusy import script, not manual entry).
  Migration `008_time_tracking.sql` and the `time_entries` table remain. Stop
  carrying this as a todo.

## ⏳ WAITING ON OTHER PEOPLE — you can only START these, never finish them alone

You initiate, then it's out of your hands. Do NOT carry these as "todos" in your head —
they're not your work anymore once you've kicked them off.

- **QuickBooks** — one read-only Authorize click from the QB admin (lined up ✅).
  Unlocks per-job P&L, the loss list, Margin Radar.
- **Google Business Profile** — Cloud project `mhp-brain` (#551210736680) created.
  Left for you: OAuth client → enable Business Profile API → submit the access request.
  Then **wait on Google's approval** (days). Reviews appear on their own when approved.
- **Gmail / Teams / DocuSign / CompanyCam** — each just needs portal creds pasted.
  Gravy. Do whenever the right admin is around.

## 🔨 YOUR BUILD QUEUE — actually undone, 100% in your control, in order

1. **Time tracking (replace BusyBusy)** ← the real project
   - ✅ Phase 1 — the spine — DONE; foreman hour-entry UI later removed (see bucket 1)
   - ⏳ **Phase 2 — estimate vs actual labor per job** — FULLY BUILT, gated on QB (2026-06-25).
     Two decisions: variance is **dollars-to-dollars from QuickBooks** (book-accurate, no
     rate assumption), and combined "Material & Labor" estimate lines count their labor
     **fraction** (`COMBINED_LINE_LABOR_FRACTION = 0.4`).
       • Estimated side (live now): `lib/labor-variance.ts` + "Labor (estimate vs actual)"
         panel on the job page. 12 web tests.
       • Actual side (wired, lights up on QB connect): `qb_pnl.py` isolates per-job labor
         **cost** from QB expense lines posted to labor accounts (`LABOR_ACCOUNT_PATTERNS`),
         writes `mhp.db.qb_job_costs` for trusted matches only; `sync_to_pg.mjs` carries it
         to Postgres; the panel reads it. `test_labor_cost.py` proves classification + guard.
     → Remaining for Phase 2 (both bucket 2, not solo build): the QB **Authorize click**, and
       on first pull, **verify `LABOR_ACCOUNT_PATTERNS` against MHP's real chart of accounts**
       (the one assumption — wrong accounts = fabricated number). After that, variance is live.
   - Phase 3 — field self-punch (mobile) + payroll export
2. _(next thing lands here when Phase 2 fully closes — i.e. QB connected + accounts verified)_

## 👉 RIGHT NOW

Phase 2 is built end-to-end — both the estimate and the QB-actual sides. What's left is
**not your build**: (1) the QuickBooks **Authorize click** (TOMORROW.md, Part 1), and (2) a
one-time check that the labor-account list (`LABOR_ACCOUNT_PATTERNS` in `qb_pnl.py`) matches
MHP's real chart of accounts — the docstring there has the one-liner to dump the account
names. Run `./qb_refresh.sh --full` after the connect and the variance panel fills itself in.

---

_Rule for the fog: the feeling of "behind" lies. Check this board. If it's in
bucket 1 it's done; if it's in bucket 2 it's not your move; bucket 3 is the only
place real work lives — and there's only ever one "right now."_
