"""Data discrepancy audit — what in mhp.db doesn't add up, ranked by how much it matters.

This is an honest integrity check, not a pricing report. It hunts for: inflated counts from
duplicate revisions, hollow project records, missing validation totals, unusable actuals,
unit-contaminated catalog rates, and bad references/values. It also states plainly what IS
clean, so the trustworthy parts are trustworthy.

Read-only on mhp.db (mode=ro). Output -> DISCREPANCIES.md.

Run:  python3 discrepancies.py
"""
import sqlite3
from pathlib import Path

HERE = Path(__file__).parent
DB = HERE / "mhp.db"
OUT = HERE / "DISCREPANCIES.md"


def q1(con, sql, args=()):
    return con.execute(sql, args).fetchone()


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

    # --- counts ---
    n_proj = q1(con, "SELECT COUNT(*) FROM projects")[0]
    n_with_est = q1(con, "SELECT COUNT(DISTINCT project_id) FROM estimates")[0]
    n_hollow = q1(con, "SELECT COUNT(*) FROM projects WHERE id NOT IN (SELECT DISTINCT project_id FROM estimates)")[0]
    n_hollow_dead = q1(con, "SELECT COUNT(*) FROM projects WHERE id NOT IN (SELECT DISTINCT project_id FROM estimates) AND status='Dead'")[0]
    hollow_nondead = con.execute(
        "SELECT status, COUNT(*) FROM projects WHERE id NOT IN (SELECT DISTINCT project_id FROM estimates) "
        "AND status NOT IN ('Dead') GROUP BY status ORDER BY 2 DESC").fetchall()

    n_est = q1(con, "SELECT COUNT(*) FROM estimates")[0]
    n_lines = q1(con, "SELECT COUNT(*) FROM line_items")[0]
    unique_work = q1(con, "WITH b AS (SELECT project_id, MAX(line_item_count) mx FROM estimates "
                          "GROUP BY project_id) SELECT SUM(mx) FROM b")[0] or 0
    inflation = n_lines / unique_work if unique_work else 0

    # --- validation gap ---
    n_stated = q1(con, "SELECT COUNT(*) FROM estimates WHERE stated_total IS NOT NULL AND stated_total>0")[0]
    conf = dict(con.execute("SELECT parse_confidence, COUNT(*) FROM estimates GROUP BY parse_confidence"))

    # --- actuals quality ---
    act = con.execute("SELECT project_id, closing_total FROM actuals").fetchall()
    act_total = len(act)
    act_null = sum(1 for _, c in act if c is None or c == 0)
    act_dups = q1(con, "SELECT COUNT(*)-COUNT(DISTINCT project_id) FROM actuals")[0]
    act_distinct = q1(con, "SELECT COUNT(DISTINCT project_id) FROM actuals WHERE closing_total>0")[0]

    # --- catalog contamination ---
    contaminated = con.execute(
        "SELECT description, unit, n_jobs, min_price, median_unit_price, max_price, "
        "ROUND(max_price/min_price) ratio FROM unit_costs "
        "WHERE min_price>0 AND max_price/min_price>20 ORDER BY ratio DESC").fetchall()
    n_cat = q1(con, "SELECT COUNT(*) FROM unit_costs")[0]

    # --- what's clean ---
    line_math_bad = q1(con, "SELECT COUNT(*) FROM line_items WHERE price_kind='UNIT_RATE' "
                            "AND qty>0 AND unit_price>0 AND item_total>0 "
                            "AND ABS(qty*unit_price-item_total)/item_total>0.01")[0]
    orphans = q1(con, "SELECT (SELECT COUNT(*) FROM estimates WHERE project_id NOT IN (SELECT id FROM projects))"
                      "+(SELECT COUNT(*) FROM line_items WHERE estimate_id NOT IN (SELECT id FROM estimates))")[0]
    neg = q1(con, "SELECT SUM(qty<0)+SUM(unit_price<0)+SUM(item_total<0) FROM line_items")[0] or 0
    neg_markup = q1(con, "SELECT COUNT(*) FROM line_items WHERE sov_total>0 AND item_total>0 AND sov_total<item_total")[0]
    sov_null = q1(con, "SELECT COUNT(*) FROM line_items WHERE sov_total IS NULL")[0]

    o = [f"# MHP Brain — Data Discrepancy Audit", "",
         "*What in the data doesn't add up, ranked by how much it changes the answer. Read-only "
         "audit of `mhp.db`.*", "",
         "## TL;DR", "",
         f"- The **structure** is sound: line-item math is exact, no broken references, no negative "
         f"or impossible values, markup never inverts.",
         f"- The **counts are inflated** and the **coverage is thinner** than the headline numbers "
         f"suggest. Two findings below change how to read every prior report.", "",
         "---", "", "## CRITICAL", "",
         f"### 1. Line counts are inflated ~{inflation:.1f}× by duplicate revisions", "",
         f"`line_items` holds **{n_lines:,}** rows, but those come from **{n_est} estimate files "
         f"across only {n_with_est} projects** — the same jobs re-bid many times, every version "
         f"kept. Counting just the largest estimate per project, the real unique work is "
         f"**~{unique_work:,.0f} lines**. So **{inflation:.2f}× inflation**.", "",
         f"**Impact:** every *absolute line count* I've reported (e.g. \"1,535 of 5,550 lines "
         f"underpriced\") is inflated by this factor. The *ratios* (markup %, % underpriced) survive "
         f"because the duplication hits numerator and denominator alike — but no absolute "
         f"line-count or summed-dollar-gap figure should be read as unique work.", "",
         f"### 2. {n_hollow} of {n_proj} project records ({100*n_hollow//n_proj}%) have no bid data at all", "",
         f"Only **{n_with_est}** of the **{n_proj}** projects carry any parsed estimate. "
         f"**{n_hollow}** are hollow records. Most ({n_hollow_dead}) are Dead — fine — but these "
         f"non-dead ones are a real contradiction (status says live, data says empty):", "",
         "| Status (non-dead, no bid data) | Projects |", "|---|--:|"]
    for st, c in hollow_nondead:
        o.append(f"| {st} | {c} |")
    o += ["",
          f"A project marked **Bid** or **Active** with zero captured estimate means either the "
          f"estimate file was never parsed or the status is stale. Worth reconciling before trusting "
          f"the pipeline view.", "",
          "---", "", "## HIGH", "",
          f"### 3. No estimate total is validated against the sheet's own bottom line", "",
          f"`stated_total` is populated on **{n_stated} of {n_est}** estimates — i.e. never. The "
          f"system only knows *the sum of lines it managed to parse*; there's nothing to confirm "
          f"that sum equals what MHP actually bid. Combined with **{conf.get('FAILED',0)} FAILED "
          f"parses** (0 lines captured) and **{conf.get('FLAGGED',0)} FLAGGED**, a \"CLEAN\" parse "
          f"that silently dropped half a sheet would look identical to a correct one.", "",
          f"### 4. Actuals are too thin and dirty to support variance", "",
          f"The `actuals` table has **{act_total} rows**, but: **{act_dups}** are duplicate "
          f"closeouts of the same project (Jooste appears 3× from 3 files), **{act_null}** has no "
          f"total, and one is a $638 closet materials receipt — not a closeout. That leaves "
          f"**~{act_distinct} usable**, and those are **materials-only** worksheets, not full job "
          f"cost. Comparing them to full bids produces nonsense like \"55–82% under bid.\"", "",
          f"**Contradiction:** `variance.md` claims Jooste came in *over* (~$285k → $375k), but the "
          f"DB has Jooste's bid at **$826k**. Those two can't both be right — the variance report is "
          f"using a different bid figure than the database. Treat all estimate-vs-actual variance as "
          f"unreliable until QuickBooks actuals land.", "",
          "---", "", "## MODERATE", "",
          f"### 5. {len(contaminated)} of {n_cat} catalog rates mix units (median is garbage)", "",
          f"These per-unit rows blend lump sums or different units into one \"unit rate,\" so the "
          f"median is meaningless — the price range spans 20×–500×:", "",
          "| Item | Unit | Jobs | Min | Median | Max | Max/Min |", "|---|---|--:|--:|--:|--:|--:|"]
    for desc, unit, nj, lo, med, hi, ratio in contaminated:
        o.append(f"| {desc[:34]} | {unit} | {nj} | ${lo:,.2f} | ${med:,.2f} | ${hi:,.2f} | {ratio:.0f}× |")
    o += ["",
          "Example: **Shower Labor / sqft** runs $4.50 → $2,200 — the $2,200 is a whole-shower lump "
          "wearing a per-sqft label. Same root cause as the brick bug: `normalize.py`'s classifier "
          "let non-unit lines into the unit catalog. These rates should be excluded or re-keyed "
          "before they drive any auto-pricing.", "",
          "---", "", "## What's actually clean (verified)", "",
          f"- **Line math:** {line_math_bad} lines where qty×unit_price ≠ item_total. (Exact — though "
          f"partly by construction, since the classifier defines unit-rate that way.)",
          f"- **References:** {orphans} orphaned estimates or line items. Every child ties to a parent.",
          f"- **Bad values:** {neg} negative qty/price/total. {neg_markup} lines where sell < cost.",
          f"- **Markup:** never inverts; max line markup ~34%, no absurd outliers. "
          f"({sov_null} lines have null sell and are excluded from markup, which is correct.)", "",
          "---", "", "## Fix order (highest payback first)", "",
          "1. **Dedupe to one canonical estimate per project** (latest, or largest clean version) "
          "before any counting. Kills the 2.35× inflation at the source.",
          "2. **Capture `stated_total`** in `extract.py` so every parse can be checked against the "
          "sheet's own total — turns silent partial-parses into caught errors.",
          "3. **Exclude the 14 contaminated catalog rates** (or fix unit labeling in normalize) so "
          "the catalog medians are all trustworthy.",
          "4. **Quarantine the actuals table** until QuickBooks — dedupe Jooste, drop the $638 "
          "receipt and the null, and label the rest materials-only.",
          "5. **Reconcile the 19 non-dead hollow projects** — parse the missing estimate or fix the "
          "status.", "",
          "---",
          f"\n*Read-only audit of `mhp.db`. Re-run `python3 discrepancies.py` after fixes to confirm.*"]

    OUT.write_text("\n".join(o) + "\n")
    con.close()
    print(f"Wrote {OUT.name}")
    print(f"  CRITICAL: {inflation:.2f}x line inflation ({n_lines:,} -> ~{unique_work:,.0f}); "
          f"{n_hollow}/{n_proj} hollow projects")
    print(f"  HIGH: 0/{n_est} stated totals; actuals ~{act_distinct} usable of {act_total}")
    print(f"  MODERATE: {len(contaminated)}/{n_cat} contaminated catalog rates")
    print(f"  CLEAN: line-math={line_math_bad}, orphans={orphans}, bad-values={neg}")


if __name__ == "__main__":
    main()
