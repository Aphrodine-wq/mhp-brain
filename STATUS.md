# MHP Brain — What To Do (the clear board)

_Updated 2026-06-23. When you feel lost or behind, read THIS, not your gut. Three
buckets. Most of what feels "undone" is already in the first one._

## ✅ DONE — needs nothing (stop re-checking these)

- **All 7 integrations are code-complete**: QuickBooks, Gmail, Microsoft Teams,
  DocuSign, Google Business Profile, CompanyCam, Trello. The code is written.
- **Trello board-scoping** (pull the right board, not all boards) — committed.
- **GBP reviews display** (`ReviewsPanel`) — built; lights up automatically on first sync.
- **Per-job P&L pipeline, daily logs, change orders, estimates, catalog** — built.
- **Time tracking Phase 1 — the spine + foreman hour entry** — DONE & GREEN (2026-06-23).
  `lib/time.ts` spine, `/time` form, `/api/time` route (editor+, server-side actor),
  migration `008_time_tracking.sql`, 12 passing tests. The `actualLaborHours()` Phase 2
  hook is already in place. Stop carrying this as a todo.

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
   - ✅ Phase 1 — the spine + foreman hour entry — DONE (see bucket 1)
   - ⏳ **Phase 2 — estimate vs actual labor per job** — ESTIMATED SIDE DONE (2026-06-25).
     Two decisions made: variance is **dollars-to-dollars from QuickBooks** (book-accurate,
     no rate assumption), and combined "Material & Labor" estimate lines count their labor
     **fraction** (`COMBINED_LINE_LABOR_FRACTION = 0.4`). Built `lib/labor-variance.ts`
     (`estimatedLabor`, `laborVariance`) + "Labor (estimate vs actual)" panel on the job
     page + 12 tests (140 total green). The estimated-labor readout is live now; the
     **actual** side lights up the moment QuickBooks is authorized — it reads `qb_job_costs`
     (table arrives with the QB pipe), same pattern as Margin/Collected.
     → Remaining for Phase 2: the QB Authorize click (bucket 2) + the QB→web `qb_job_costs`
       cost write in `qb_refresh.sh`.
   - Phase 3 — field self-punch (mobile) + payroll export
2. _(next thing lands here when Phase 2 fully closes — i.e. QB connected)_

## 👉 RIGHT NOW

Phase 2's in-your-control half is shipped. The variance number itself is now gated on the
**QuickBooks Authorize click** (TOMORROW.md, Part 1) — that's bucket 2, not your build.
When QB is connected, wire `qb_refresh.sh` to write per-job labor cost into `qb_job_costs`
and the panel completes itself.

---

_Rule for the fog: the feeling of "behind" lies. Check this board. If it's in
bucket 1 it's done; if it's in bucket 2 it's not your move; bucket 3 is the only
place real work lives — and there's only ever one "right now."_
