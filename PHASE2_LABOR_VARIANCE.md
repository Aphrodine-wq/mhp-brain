# Phase 2 — Estimate-vs-Actual Labor Variance (design, not yet built)

_Written 2026-06-23. Phase 1 (time-tracking spine + foreman entry) is DONE & green.
This note exists so Phase 2 starts as execution, not archaeology._

## The loop we're closing

Every finished job should make the next bid smarter: "you bid N labor for this job
type, the crew actually burned M — adjust." That's the whole point of having logged hours.

## The blocker (a real units mismatch — do not hand-wave it)

The two sides don't speak the same unit:

- **Actuals** (`time_entries`, via `actualLaborHours(projectId)`) are in **HOURS**.
- **Estimates** (`saved_estimates.lines`, JSONB) carry labor as **DOLLARS** — separate
  "…Labor" line items priced off catalog median rates × sqft-derived qty. There is **no
  labor-hours field** on an estimate line.
- `margin.ts` works at total-cost level only and does **not** isolate labor. Nothing to reuse.

So "hours vs hours" is impossible today without a conversion, and a wrong variance number
in a job-costing tool is worse than none — it would steer real bids. We do not ship a
fabricated number.

## Two sub-problems to resolve before building

1. **Which estimate lines are labor?**
   Clean labor lines contain "Labor" in `desc` (Framing Labor, Interior Paint Labor…).
   But combined lines mix: "Plumbing Material & Labor", "Shower Door (Included Material &
   Labor)". Need a rule: ignore combined lines, or split them by a fixed labor fraction?

2. **The hours↔dollars bridge.**
   `crew.rate` exists (nullable string) but population is unverified. Options:
   - (a) **Blended crew rate** — average populated `crew.rate`, convert
     `estLaborHours = estLaborDollars / blendedRate` and
     `actualLaborDollars = actualHours × blendedRate`. Show variance in both units,
     label the rate assumption on screen so it never reads as ground truth.
   - (b) **Dollars-only** — once QB actual-cost is wired (qb_pnl.py), compare estimated
     labor $ vs actual labor $ from the books. More accurate, but gated on the QB connect.
   - (c) **Raw side-by-side, no conversion** — show "estimated labor: $X" next to
     "actual: M hours logged" on the job page. Honest, zero fabrication, but no single
     variance %. Safe to ship today as a stepping stone.

## The one decision needed from James

> What's the blended crew labor rate I should use (or should Phase 2 wait for the QB
> connect and compare dollars-to-dollars)? And do combined "Material & Labor" lines count
> toward estimated labor, get ignored, or split by a fixed %?

Answer that and Phase 2 is a clean build: option (a) for an immediate in-app loop, or
(b) once QB is authorized for book-accurate numbers. Option (c) is the safe interim.

## Recommendation

Ship **(c)** as a small, honest job-page readout now (no lying), then build **(a)** the
moment James gives a blended rate, and let **(b)** supersede it when QB actual-cost lands.
