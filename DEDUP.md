# MHP Brain — Estimate Dedup

*One canonical estimate per project, so counts reflect real work instead of every revision. The flag is additive — all revisions are kept, the winner is marked.*

## Result

- **213 estimate files → 83 canonical** (one per project with a usable bid).
- **8,369 line items → 3,210 canonical** — the duplicate revisions were inflating counts **2.61×**.
- **2 projects** have no canonical (only failed/empty parses) — they contribute zero real work and were silently double-counted before only as noise.

## How to use it

Any analysis that should count real work reads the views instead of the raw tables:

```sql
SELECT * FROM canonical_line_items;   -- real priced lines, no dupes
SELECT * FROM canonical_estimates;    -- the final bid per project
```

Or filter directly: `... FROM estimates WHERE is_canonical=1`.

## Canonical picks — most-revised projects (eyeball check)

| Project | Versions | Picked (final) | Conf | Date | Lines | Bid |
|---|--:|---|---|---|--:|--:|
| jim-and-jennifer-eaton | 12 | eaton-project-docs-bb-3086-fv-mhp- | CLEAN | 2025-03-26 | 178 | $1,372,332 |
| david-monteleone | 9 | david-m-estimate-sheet-may-12-2023 | CLEAN | 2023-05-12 | 13 | $18,632 |
| sandi-woods | 8 | woods-backyard-project-mhp-estimat | CLEAN | 2024-09-12 | 11 | $33,296 |
| dan-stearns-new-build-project | 8 | stearns-home-build-folder-mhp-dan- | CLEAN | 2025-10-05 | 84 | $1,628,393 |
| lachlan-mcqueen-oxford-veterin | 7 | rdb-working-folder-nmhp-vet-projec | CLEAN | 2024-06-26 | 87 | $2,996,960 |
| ken-williams-home-improvement- | 7 | ken-willams-project-docs-rv1-mhp-k | CLEAN | 2025-05-20 | 31 | $105,941 |
| jooste-project-master-file | 6 | jooste-nmhp-master-jooste-estimate | CLEAN | 2023-03-13 | 83 | $766,073 |
| gianna-savage-project | 6 | nmhp-estimating-sheet-savage-home- | CLEAN | 2023-12-18 | 29 | $79,697 |
| bill-taylor-outdoor-project | 6 | mcmahan-project-docs-mhp-project-e | CLEAN | 2025-08-13 | 12 | $29,965 |
| shawan-and-heather-gill-shop-h | 5 | gill-project-docs-nmhp-project-est | CLEAN | 2024-04-09 | 65 | $552,648 |

---

## Pick rule

Candidates = estimates with ≥1 line and not flagged `DUPLICATE_EXPORT` (FAILED parses have 0 lines, so they drop out). Winner, in order: **CLEAN > FLAGGED**, then **latest `est_date`** (dated beats undated), then **most lines**, then source filename. That picks the *final* bid that went out — not the largest, since early bids run high and get cut.

## Safety

- DB backed up to `.backups/mhp.db.20260604-100437.bak` before any write.
- Only additive changes: one `is_canonical` column + two views. No row deleted, no value altered. Re-runnable — flags recompute from scratch each run.

## Next step (not done here)

`normalize.py` still builds the catalog from *all* line items. Point it at `canonical_line_items` to rebuild `unit_costs`/`lump_costs` on real work only — that's the change that makes the pricing catalog itself dedup-correct.

---

*Wrote `is_canonical` + `canonical_estimates`/`canonical_line_items` views to mhp.db. Backup: `mhp.db.20260604-100437.bak`.*
