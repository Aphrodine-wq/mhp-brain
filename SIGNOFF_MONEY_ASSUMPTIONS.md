# Money-Math Assumptions — needs Josh / the accountant to confirm

Four numbers/answers in the financial path are **placeholders chosen by us, not MHP facts**.
Every one of them is built to **fail safe** today — when the input is missing or unverified the
app shows "awaiting" or "n/a" rather than a wrong dollar figure — so nothing here blocks launch.
But before the per-job money numbers are treated as ground truth, get these four confirmed.

_Last updated 2026-06-25. Owner to collect: James → Josh / the bookkeeper / the accountant._

---

### 1. Combined "Material & Labor" labor split — currently **40%**
- **Where:** `web/lib/labor-variance.ts` → `COMBINED_LINE_LABOR_FRACTION = 0.4`
- **What it does:** estimate lines like "Plumbing Material & Labor" don't separate labor from
  material, so we count 40% of the line as labor when comparing estimated vs actual labor.
- **Confirm:** for MHP's typical combined lines, what fraction is actually labor? One number is
  fine, or a rule of thumb by trade.
- **Fail-safe today:** only affects the *estimated* side of labor variance; the *actual* side is
  dollars-to-dollars from QuickBooks, so a wrong split never invents an actual cost.

### 2. Labor-account names in QuickBooks — currently matches **labor / wages / payroll / crew**
- **Where:** `qb_pnl.py` → `LABOR_ACCOUNT_PATTERNS`
- **What it does:** decides which QB expense accounts count as job labor cost.
- **Confirm:** run `./qb.sh qb_pnl.py --verify-accounts` after the first QB pull — it lists every
  expense account and flags which ones currently count as labor. Every real labor/payroll account
  must read `[LABOR]`; if one doesn't, add it to the pattern list and re-run.
- **Fail-safe today:** an account that doesn't match leaves a job's labor cost empty → the panel
  reads "awaiting QuickBooks," never a fabricated $0 / −100% variance.

### 3. Does the bookkeeper tag bills to **Customer:Job**?
- **Where:** drives `line_amounts_by_customer` / `labor_cost_by_customer` in `qb_pnl.py`
- **What it does:** if bills are tagged per job, matching is near-automatic. If a multi-job bill has
  some untagged lines, those dollars are now sent to a **review pool** ("unallocated") instead of
  being dumped on the header job (that was a silent-misallocation bug, fixed 2026-06-25).
- **Confirm:** does the bookkeeper tag bills to Customer:Job? Either way works — we just need to
  know how much to expect in the unallocated pool.
- **Fail-safe today:** ambiguous dollars go to "unallocated" and are reported, never guessed onto a job.

### 4. Bid-vs-actual cost baseline — now the estimate's **own pre-markup cost** (no guessed markup)
- **Where:** `qb_pnl.py` → `load_bid_data` / `bid_comparison`
- **What changed (2026-06-25):** we removed the global `0.862` markup guess. Cost variance now
  compares actual cost to the estimate's own `sum_item_total` (its pre-markup cost). When an
  estimate didn't record one, the variance shows **n/a** instead of a guessed number.
- **Confirm:** nothing required unless you want a portfolio markup shown where an estimate lacks a
  pre-markup cost — default is to show n/a (no guess).
- **Note:** loss classification has always keyed on actual `gross_margin = revenue − cost`; that
  was never affected by the markup guess and didn't change.
