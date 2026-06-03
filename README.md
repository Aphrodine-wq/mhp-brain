# MHP Estimate Brain

Read-only **accuracy analyzer** over MHP Construction's historical estimates. Turns the 814
estimate spreadsheets trapped in folders into a structured, queryable line-item database — so we
can see what MHP actually charges and where it under/over-bids, grounded in real completed jobs.

## Status: Layers 0–2 working

- **Layer 0 — Extraction:** 88% clean-parse across the **full portfolio** (104/118 estimates,
  4,298 line items). 14 failures are older freeform sheets, correctly refused.
- **Layer 1 — Normalization:** classified 2,892 unit-rate / 1,300 lump-sum / 106 irregular lines;
  built **223 normalized unit-cost entries** (median + p25/p75). Framing Labor went from a useless
  "$4–50/sqft" to a trustworthy **median $7.25** (band $6.25–$9.00, 68 jobs).
- **Layer 2 — Estimation engine:** `generate` (price a scope from catalog medians) and `reprice`
  (compare a real job's rates to catalog norm). Surfaces job-count, p25–p75 band, and contingency.
  Catalog + template rows are keyed on **(CSI item #, canonical description)** — robust to
  whitespace/case, disambiguates material/labor pairs, and keeps the dominant-unit rate (a 3-job
  outlier can't hijack a 68-job line). Lump-sum items priced from a separate lump catalog.
- **xlsx output:** `generate` writes a **native MHP estimate** (`estimate_out.xlsx`) by filling the
  input cells of the real template — the Item Total / Markup / SOV formulas recompute in Excel on open.

The original risky assumption — "can we reliably extract structured line items?" — is **proven**.

MHP estimates on a standardized **CSI-MasterFormat template** (stable since March 2023): fixed header
row, Division sections, fixed columns (`Item # | Description | Qty | Unit | Unit Price | Material |
Labor | Sub Bid | Item Total | Markup | SOV Total`). The extractor is deterministic, not heuristic —
it replaces the old `biggest_dollar_in_xlsx` guess that undercounted Mason Kitchen by half ($163K → real $315K).

The 2 failures are *correct refusals*: older freeform sheets not on the template, flagged
`NO_TEMPLATE_HEADER` instead of guessing.

## Run

```bash
python3 extract.py                 # parse full portfolio -> mhp.db (add --kitchen to scope down)
python3 normalize.py               # Layer 1 -> unit_costs + lump_costs + cost_catalog.md
python3 refine.py                  # data-quality: real sub roster + honest project status
python3 report.py                  # -> parse_report.md + variance.md
python3 estimate.py generate       # price the demo kitchen scope -> estimate_demo.md + estimate_out.xlsx
python3 app.py                     # the web app -> http://localhost:8770
```
Pipeline order matters: `extract` rebuilds the tables, so run `normalize` then `refine` after it.

Only dependency: `openpyxl`. Store is sqlite3 (stdlib).

## Files
- `schema.sql` — the data contract: projects / estimates / line_items / actuals
- `select_corpus.py` — resolve projects → prime estimate + closeout files
- `extract.py` — templated parser w/ validation flags (PHASE_ONLY, DUPLICATE_EXPORT, NO_TEMPLATE_HEADER, $0-SOV)
- `report.py` — parse-rate report + estimate-vs-actual variance
- `normalize.py` — Layer 1: classify lines, build the CSI-keyed unit + lump catalogs
- `build_blank.py` — make `mhp_template_blank.xlsx` (formulas kept, inputs cleared) for output
- `estimate.py` — the estimation engine (generate + reprice + xlsx writer)
- `refine.py` — data-quality pass: builds the real `subs` roster (Corinth list + estimate sheets +
  job history, ~101 vs the old 10) and re-buckets project status by latest activity (Active=2026,
  Aging=2025, Likely Done=≤2024) plus the _BID PIPELINE / _PAUSED jobs
- `parse_job.py` — v0 free-text → seed scope (the ConstructionAI plug-in seam)
- `app.py` — the web app: Home / Estimates / Projects / Subs / Crew

## Web app

```bash
python3 app.py    # -> http://localhost:8770
```
Estimator describes a job (+ uploads), the engine seeds an estimate from the catalog, they edit
every qty/rate live (totals + band shown per line), then Export to Excel writes the MHP template.
Zero-install (stdlib http.server). The free-text parser is deterministic v0 — ConstructionAI is the
intended upgrade (reads prose + uploaded plans -> structured scope; same UI).

## Known limits (next layers, not yet built)
- **No full-cost actuals.** Only materials closeouts exist in structured form — true cost variance
  (the accuracy flywheel) needs full job closeouts we don't yet have.
- **Unit-cost normalization needed.** Some lines stuff a lump sum into the per-unit cell (qty=1),
  skewing per-unit aggregates. Layer 1 must normalize lump-sum vs true unit pricing.
- **Non-template estimates** (older freeform) need a separate parser or human entry.
- **xlsx only.** PDF estimates not parsed yet.

## Source data
`~/Desktop/Walt/Clients/MHP Construction (Josh)/` — 149 projects, ~8,600 files, 13 GB.
