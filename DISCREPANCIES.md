# MHP Brain — Data Discrepancy Audit

*What in the data doesn't add up, ranked by how much it changes the answer. Read-only audit of `mhp.db`.*

## TL;DR

- The **structure** is sound: line-item math is exact, no broken references, no negative or impossible values, markup never inverts.
- The **counts are inflated** and the **coverage is thinner** than the headline numbers suggest. Two findings below change how to read every prior report.

---

## CRITICAL

### 1. Line counts are inflated ~2.3× by duplicate revisions

`line_items` holds **8,369** rows, but those come from **213 estimate files across only 85 projects** — the same jobs re-bid many times, every version kept. Counting just the largest estimate per project, the real unique work is **~3,565 lines**. So **2.35× inflation**.

**Impact:** every *absolute line count* I've reported (e.g. "1,535 of 5,550 lines underpriced") is inflated by this factor. The *ratios* (markup %, % underpriced) survive because the duplication hits numerator and denominator alike — but no absolute line-count or summed-dollar-gap figure should be read as unique work.

### 2. 77 of 162 project records (47%) have no bid data at all

Only **85** of the **162** projects carry any parsed estimate. **77** are hollow records. Most (56) are Dead — fine — but these non-dead ones are a real contradiction (status says live, data says empty):

| Status (non-dead, no bid data) | Projects |
|---|--:|
| Paused | 8 |
| Likely Done | 5 |
| Bid | 5 |
| Unknown | 2 |
| Active | 1 |

A project marked **Bid** or **Active** with zero captured estimate means either the estimate file was never parsed or the status is stale. Worth reconciling before trusting the pipeline view.

---

## HIGH

### 3. No estimate total is validated against the sheet's own bottom line

`stated_total` is populated on **0 of 213** estimates — i.e. never. The system only knows *the sum of lines it managed to parse*; there's nothing to confirm that sum equals what MHP actually bid. Combined with **16 FAILED parses** (0 lines captured) and **2 FLAGGED**, a "CLEAN" parse that silently dropped half a sheet would look identical to a correct one.

### 4. Actuals are too thin and dirty to support variance

The `actuals` table has **8 rows**, but: **2** are duplicate closeouts of the same project (Jooste appears 3× from 3 files), **1** has no total, and one is a $638 closet materials receipt — not a closeout. That leaves **~5 usable**, and those are **materials-only** worksheets, not full job cost. Comparing them to full bids produces nonsense like "55–82% under bid."

**Contradiction:** `variance.md` claims Jooste came in *over* (~$285k → $375k), but the DB has Jooste's bid at **$826k**. Those two can't both be right — the variance report is using a different bid figure than the database. Treat all estimate-vs-actual variance as unreliable until QuickBooks actuals land.

---

## MODERATE

### 5. 14 of 298 catalog rates mix units (median is garbage)

These per-unit rows blend lump sums or different units into one "unit rate," so the median is meaningless — the price range spans 20×–500×:

| Item | Unit | Jobs | Min | Median | Max | Max/Min |
|---|---|--:|--:|--:|--:|--:|
| Shower Labor | sqft | 22 | $4.50 | $17.25 | $2,200.00 | 489× |
| Tile Material&Labor | tile | 8 | $10.00 | $14.00 | $3,850.00 | 385× |
| Foundation Waterproofing | foundation | 11 | $0.65 | $1.25 | $125.00 | 192× |
| Exterior Brick Material | each | 46 | $4.00 | $450.00 | $650.00 | 163× |
| Metal Roofing Labor | metal | 22 | $2.00 | $46.50 | $200.00 | 100× |
| Metal Roofing Labor | sqft | 17 | $2.00 | $4.00 | $165.00 | 83× |
| Exterior Brick Labor | thousand | 52 | $9.50 | $450.00 | $500.00 | 53× |
| Sidewalk Material | sidewalk | 9 | $3.50 | $5.00 | $165.00 | 47× |
| Metal Roofing Material&Labor | metal | 14 | $4.50 | $8.00 | $200.00 | 44× |
| Concrete Forming Material (Include | sqft | 76 | $0.15 | $0.95 | $6.50 | 43× |
| Electrical Conduit | lft | 5 | $7.00 | $8.00 | $250.00 | 36× |
| Exterior Trim Labor | sqft | 95 | $1.00 | $2.00 | $25.00 | 25× |
| Exterior Paint Labor | exterior | 90 | $0.25 | $3.00 | $6.00 | 24× |
| Concrete Floor Staining/Scoring Ma | sqft | 21 | $0.25 | $0.75 | $5.30 | 21× |

Example: **Shower Labor / sqft** runs $4.50 → $2,200 — the $2,200 is a whole-shower lump wearing a per-sqft label. Same root cause as the brick bug: `normalize.py`'s classifier let non-unit lines into the unit catalog. These rates should be excluded or re-keyed before they drive any auto-pricing.

---

## What's actually clean (verified)

- **Line math:** 0 lines where qty×unit_price ≠ item_total. (Exact — though partly by construction, since the classifier defines unit-rate that way.)
- **References:** 0 orphaned estimates or line items. Every child ties to a parent.
- **Bad values:** 0 negative qty/price/total. 0 lines where sell < cost.
- **Markup:** never inverts; max line markup ~34%, no absurd outliers. (47 lines have null sell and are excluded from markup, which is correct.)

---

## Fix order (highest payback first)

1. **Dedupe to one canonical estimate per project** (latest, or largest clean version) before any counting. Kills the 2.35× inflation at the source.
2. **Capture `stated_total`** in `extract.py` so every parse can be checked against the sheet's own total — turns silent partial-parses into caught errors.
3. **Exclude the 14 contaminated catalog rates** (or fix unit labeling in normalize) so the catalog medians are all trustworthy.
4. **Quarantine the actuals table** until QuickBooks — dedupe Jooste, drop the $638 receipt and the null, and label the rest materials-only.
5. **Reconcile the 19 non-dead hollow projects** — parse the missing estimate or fix the status.

---

*Read-only audit of `mhp.db`. Re-run `python3 discrepancies.py` after fixes to confirm.*
