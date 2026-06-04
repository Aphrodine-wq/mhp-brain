# MHP Pricing Analysis

*Profit leaks and pricing consistency, computed from real MHP bid history. Nothing here needs a new job won — it's all in how the work gets priced.*

Source: **85 projects**, **8,369 line items**, **298 catalog items**. Bid data only — actuals (QuickBooks) not yet wired, so these are *bid* margins, not *realized* margins.

---

## 1. Markup is thin and flat

Across **8,322 priced lines**, MHP marks up **15.9%** over direct cost — a gross margin of **13.7%** — and it's nearly identical in every division:

| Division | Lines | Markup |
|---|--:|--:|
| Division 1: General Requirements | 1,402 | 16.7% |
| Division 9: Finishes | 1,215 | 15.8% |
| Division 6:  Wood, Plastics, Composites | 1,207 | 15.9% |
| Division 7:  Thermal & Moisture Protection | 627 | 15.6% |
| Division 3:  Concrete | 526 | 15.9% |
| Division 8:  Openings (Doors & Windows) | 427 | 15.8% |
| Division 4:  Masonry | 399 | 15.8% |
| Division 12: Furnishings | 382 | 16.1% |
| Division 26:  Electrical | 364 | 15.8% |
| Division 10:  Specialties | 335 | 15.0% |
| Division 33:  Utilities | 329 | 15.9% |
| Division 22:  Plumbing | 325 | 16.0% |
| Division 32:  Exterior Improvements | 255 | 16.7% |
| Division 31:  Earthwork | 152 | 15.7% |
| Division 2:  Existing Conditions | 144 | 17.0% |
| Division 11: Equipment | 107 | 17.5% |
| Division 23:  HVAC | 86 | 15.5% |

Flat markup across every division is the tell: it's a habit, not a decision. Overhead — office, insurance, trucks, Rick's pay — comes *out* of that 14%, which is why a busy year can still feel broke. Residential remodel GCs typically run **25-50%**.

Moving **16% → 25%** (conservative) lifts margin **14% → 20%** on the same work:

- Representative job (~$126,000 sell, ~$108,731 cost) → reprice to **$135,914** = **+$9,914 profit, same job.**
- Across ~17 jobs/year: **+$168,533/year**, pure margin.

---

## 2. Underbidding your own proven rates (unit-corrected)

> **Correction:** the earlier `PROFIT_OPPORTUNITIES.md` reported division gaps up to **$381,691,192** (Electrical). That was a bug — the catalog was matched on description alone, so per-each rates collided with per-sqft quantities. Those dollar figures are **retracted**. Below, lines are matched on item *and unit*, so only like-for-like is compared.

Of **5,550 unit-rate lines** that matched a catalog item in the same unit, **1,535 (28%)** were bid *below* MHP's own historical median — a median **22% under** the proven rate. Money MHP has charged before and quietly gave back.

Coverage (no silent drops): 5,766 unit-rate lines total → 94 skipped (no clean unit), 122 skipped (item not in catalog / too little history), **5,550 compared**.

Underbid gap by division — *matched units only*, big single-line outliers pulled out:

| Division | Underbid lines | Gap on those lines* |
|---|--:|--:|
| Division 4:  Masonry | 75 | $3,110,558 |
| Division 7:  Thermal & Moisture Protection | 187 | $691,732 |
| Division 6:  Wood, Plastics, Composites | 321 | $460,502 |
| Division 9: Finishes | 306 | $372,619 |
| Division 12: Furnishings | 140 | $204,018 |
| Division 3:  Concrete | 127 | $129,355 |
| Division 8:  Openings (Doors & Windows) | 106 | $78,704 |
| Division 22:  Plumbing | 73 | $69,042 |
| Division 1: General Requirements | 61 | $38,099 |
| Division 26:  Electrical | 56 | $29,466 |

*\*Gap = (your median − your bid) × qty, summed over matched lines. Spans multiple bid versions, so read as ranking/direction. Total across all divisions: **$5,230,551**; of that, **$3,411,812** sits in 19 flagged outlier line(s) (>$25,000 each) listed below — excluding those, **$1,818,739** is the steady, believable leak.*

Flagged single-line gaps (verify these by hand — likely a big-qty line or a mis-keyed unit, not a real per-line giveaway):

| Division | Item | Unit | Bid | Median | Qty | Line gap |
|---|---|---|--:|--:|--:|--:|
| Division 4:  Mason | exterior brick material | each | $4.00 | $450.00 | 1,000 | $446,000 |
| Division 4:  Mason | exterior brick material | each | $4.00 | $450.00 | 1,000 | $446,000 |
| Division 4:  Mason | exterior brick material | each | $4.00 | $450.00 | 1,000 | $446,000 |
| Division 4:  Mason | exterior brick labor | thousand | $9.50 | $450.00 | 480 | $211,440 |
| Division 4:  Mason | exterior brick labor | thousand | $9.50 | $450.00 | 480 | $211,440 |
| Division 4:  Mason | exterior brick material | each | $11.50 | $450.00 | 480 | $210,480 |
| Division 4:  Mason | exterior brick material | each | $11.50 | $450.00 | 480 | $210,480 |
| Division 4:  Mason | exterior brick material | each | $11.50 | $450.00 | 420 | $184,170 |
| Division 4:  Mason | exterior brick material | each | $11.50 | $450.00 | 420 | $184,170 |
| Division 4:  Mason | exterior brick material | each | $11.50 | $450.00 | 420 | $184,170 |

---

## 3. Pricing consistency

How tight is each catalog rate? **Spread = (p75 − p25) / median** (the typical band). Restricted to items seen on **≥5 jobs** so a fluke can't pose as a pattern. Wide = the estimator is guessing or scope swings; tight = a reliable rate you can lock today.

### Loosest items — biggest pricing uncertainty (need a locked rate + contingency)

| Item | Div | Unit | Jobs | p25 | Median | p75 | Spread |
|---|---|---|--:|--:|--:|--:|--:|
| Metal Roofing Material&Labor | 7:  Therma | metal | 14 | $8.00 | $8.00 | $171.25 | 2041% |
| Metal Roofing Labor | 7:  Therma | metal | 22 | $5.75 | $46.50 | $200.00 | 418% |
| Architectural Plans | 1: General | each | 12 | $100.00 | $100.00 | $312.50 | 212% |
| Concrete Floor Staining/Scorin | 9: Finishe | sqft | 21 | $0.50 | $0.75 | $1.95 | 193% |
| Hardwood Labor | 9: Finishe | sqft | 5 | $1.75 | $1.75 | $5.00 | 186% |
| Backsplash Labor | 9: Finishe | backsplash | 32 | $8.00 | $10.50 | $25.00 | 162% |
| Backsplash Material | 9: Finishe | backsplash | 32 | $10.00 | $10.00 | $25.00 | 150% |
| Slab Labor | 3:  Concre | sqft | 86 | $1.98 | $2.65 | $5.00 | 114% |
| Metal Roofing Labor | 7:  Therma | square | 6 | $101.25 | $175.00 | $297.50 | 112% |
| Sidewalk Material | 32:  Exter | sidewalk | 9 | $5.00 | $5.00 | $10.50 | 110% |
| Built-ins | 12: Furnis | built | 10 | $850.00 | $2,025.00 | $2,850.00 | 99% |
| Tile Labor | 9: Finishe | tile | 46 | $4.50 | $6.00 | $10.00 | 92% |

### Tightest items — proven rates, safe to lock

| Item | Div | Unit | Jobs | p25 | Median | p75 | Spread |
|---|---|---|--:|--:|--:|--:|--:|
| Footing Material | 3:  Concre | lft | 93 | $19.00 | $19.00 | $19.00 | 0% |
| Exterior Paint Material | 9: Finishe | exterior | 92 | $1.25 | $1.25 | $1.25 | 0% |
| Footing Labor | 3:  Concre | lft | 91 | $8.00 | $8.00 | $8.00 | 0% |
| Block Labor | 4:  Masonr | block | 63 | $3.00 | $3.00 | $3.00 | 0% |
| Block Material | 4:  Masonr | block | 63 | $4.00 | $4.00 | $4.00 | 0% |
| Termite Pre-Treat | 31:  Earth | termite | 63 | $0.15 | $0.15 | $0.15 | 0% |
| Progess Cleaning | 1: General | each | 50 | $350.00 | $350.00 | $350.00 | 0% |
| Gutter Material | 7:  Therma | lft | 43 | $4.75 | $4.75 | $4.75 | 0% |
| Gutter Labor | 7:  Therma | lft | 43 | $4.50 | $4.50 | $4.50 | 0% |
| Construction Staking | 1: General | sqft | 35 | $0.35 | $0.35 | $0.35 | 0% |
| Porch Labor | 32:  Exter | sqft | 35 | $3.25 | $3.25 | $3.25 | 0% |
| Electrical Conduit | 33:  Utili | electrical | 33 | $7.00 | $7.00 | $7.00 | 0% |

### Where pricing discipline is weakest (median spread by division)

| Division | Items | Median spread |
|---|--:|--:|
| Division 8:  Openings (Doors & Windows) | 8 | 41% |
| Division 12: Furnishings | 7 | 34% |
| Division 22:  Plumbing | 5 | 29% |
| Division 6:  Wood, Plastics, Composites | 21 | 28% |
| Division 9: Finishes | 34 | 28% |
| Division 26:  Electrical | 4 | 25% |
| Division 7:  Thermal & Moisture Protection | 15 | 25% |
| Division 10:  Specialties | 5 | 22% |
| Division 2:  Existing Conditions | 3 | 22% |
| Division 32:  Exterior Improvements | 6 | 22% |
| Division 1: General Requirements | 9 | 15% |
| Division 3:  Concrete | 6 | 8% |
| Division 4:  Masonry | 6 | 1% |

---

## 4. Catalog confidence

How well-backed the 298 catalog rates are — medians on thin job counts shouldn't drive hard pricing rules:

| Backing | Items |
|---|--:|
| High (>=30 jobs) | 66 |
| Solid (10-29) | 26 |
| Usable (5-9) | 43 |
| Thin (2-4) | 163 |

---

## What to do (in order of payback)

1. **Raise the markup floor.** Per-job-type minimum (e.g. 25% on remodels); price *up* to it, not down from a gut number. Single biggest lever here.
2. **Hard-stop on sub-median rates.** When a bid line falls below the catalog median for that item+unit, flag it before the estimate ships — the brain already does this in reprice mode; now it's unit-correct.
3. **Lock the tight items, pad the loose ones.** Items in §3's tight list become fixed reference rates; the loose list carries contingency sized off its p25-p75 band.
4. **Wire actuals (QuickBooks).** Graduates every number here from *bid* margin to *realized* margin — catches jobs that bled after the bid, not just ones underpriced at bid.

---

*Generated from 85 projects of real MHP bid history. Markup figures are exact ratios; underpricing is unit-matched against MHP's own catalog; dollar projections are modeled on a representative job and labeled. Final pricing targets are James + Rick's call.*
