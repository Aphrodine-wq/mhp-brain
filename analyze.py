"""Pricing analysis — profit leaks + pricing consistency, from the real bid data.

Two questions, both answerable from bids alone (no actuals needed yet):

  1. WHERE IS MONEY GIVEN BACK?  Markup is thin and flat (~16%), and on many lines MHP bid a
     unit rate BELOW its own proven median for that exact item. Both are fixable without winning
     a single new job.

  2. HOW CONSISTENT IS THE PRICING?  For each catalog item, how tight is the historical price
     band? Wide bands mean the estimator is guessing (or scope varies) — those items need
     contingency and a locked reference rate; tight bands are safe to lock today.

This is the unit-aware successor to profit_finder.py. The old underpricing section keyed the
catalog on description ALONE (profit_finder.py:51), so a per-sqft item collided with the same
description priced per-each, and (median - bid) * qty exploded into nonsense — e.g. a
$381,691,192 "gap" on Electrical. Here the catalog lookup is keyed on (canon_desc, norm_unit),
so only like-for-like units are compared. Markup figures are pure ratios and are unaffected.

Read-only: opens mhp.db in mode=ro and never writes to it. Output -> ANALYSIS.md.

Run:  python3 analyze.py
"""
import sqlite3
import statistics
from pathlib import Path

from profit_finder import (
    overall_markup, markup_by_division,
    REP_SELL, TARGET_MARKUP, JOBS_PER_YEAR,
)

DB = Path(__file__).parent / "mhp.db"
OUT = Path(__file__).parent / "ANALYSIS.md"

# Per-line gaps above this are surfaced separately so one freak row can't dominate a division
# total. Even after unit-matching, a typo'd qty or a misparsed line can still produce an absurd
# single-line gap; we report those instead of silently folding or dropping them.
LINE_GAP_FLAG = 25_000  # dollars on a single line


def underpricing_unit_aware(con):
    """Lines bid below MHP's OWN catalog median for the same item AND the same unit.

    Returns a dict with the corrected counts, median shortfall, by-division gaps (matched units
    only), the flagged outlier lines, and the coverage bookkeeping (how many lines we could and
    could not match) so nothing is silently dropped.
    """
    # Catalog keyed by (canon_desc, unit). unit_costs.unit IS the normalized unit (normalize.py
    # inserts norm_unit into the `unit` column). On the rare collision (same desc+unit, different
    # CSI item_no) keep the median backed by the most jobs.
    cat = {}
    for cd, unit, med, njobs in con.execute(
            "SELECT canon_desc, unit, median_unit_price, n_jobs FROM unit_costs "
            "WHERE median_unit_price>0"):
        key = (cd, unit)
        if key not in cat or njobs > cat[key][1]:
            cat[key] = (med, njobs)

    rows = con.execute(
        "SELECT canon_desc, norm_unit, division, unit_price, qty FROM line_items "
        "WHERE price_kind='UNIT_RATE' AND unit_price>0 AND qty>0").fetchall()

    n_unit_rate = len(rows)
    n_no_unit = 0       # line has no normalized unit -> can't match safely
    n_no_catalog = 0    # no catalog row for this (desc, unit) -> not enough history
    n_matched = 0
    under = []          # shortfall fractions, for the median
    div_gap = {}        # division -> [gap_dollars]
    flagged = []        # (division, desc, unit, bid, median, qty, gap) for big single-line gaps

    for cd, nu, div, up, qty in rows:
        if not nu:
            n_no_unit += 1
            continue
        hit = cat.get((cd, nu))
        if not hit:
            n_no_catalog += 1
            continue
        med = hit[0]
        n_matched += 1
        if up < med * 0.97:                       # >3% below own median
            under.append((med - up) / med)
            gap = (med - up) * qty
            div_gap.setdefault(div or "?", []).append(gap)
            if gap >= LINE_GAP_FLAG:
                flagged.append((div or "?", cd, nu, up, med, qty, gap))

    by_div = sorted(((d, len(v), sum(v)) for d, v in div_gap.items()),
                    key=lambda x: x[2], reverse=True)[:10]
    flagged.sort(key=lambda x: x[6], reverse=True)
    total_gap = sum(sum(v) for v in div_gap.values())
    flagged_gap = sum(f[6] for f in flagged)
    return {
        "n_unit_rate": n_unit_rate, "n_no_unit": n_no_unit, "n_no_catalog": n_no_catalog,
        "n_matched": n_matched, "n_under": len(under),
        "med_short": statistics.median(under) if under else 0,
        "by_div": by_div, "flagged": flagged,
        "total_gap": total_gap, "flagged_gap": flagged_gap,
    }


def consistency(con, min_jobs=5):
    """Per-item price dispersion from the catalog. Spread = (p75-p25)/median (the typical band),
    range = (max-min)/median (the full swing). Restricted to items with >= min_jobs so a wild
    rate seen twice can't masquerade as a pattern."""
    rows = con.execute(
        "SELECT description, division, unit, n_jobs, median_unit_price, p25, p75, min_price, max_price "
        "FROM unit_costs WHERE n_jobs>=? AND median_unit_price>0 ORDER BY n_jobs DESC",
        (min_jobs,)).fetchall()
    items = []
    for desc, div, unit, nj, med, p25, p75, lo, hi in rows:
        spread = (p75 - p25) / med if med else 0
        rng = (hi - lo) / med if med else 0
        items.append({"desc": desc, "div": div or "?", "unit": unit or "", "n_jobs": nj,
                      "median": med, "p25": p25, "p75": p75, "min": lo, "max": hi,
                      "spread": spread, "range": rng})
    widest = sorted(items, key=lambda x: x["spread"], reverse=True)[:12]
    tightest = sorted(items, key=lambda x: x["spread"])[:12]

    # Division-level discipline: median spread ratio across that division's items.
    div_spreads = {}
    for it in items:
        div_spreads.setdefault(it["div"], []).append(it["spread"])
    by_div = sorted(((d, len(v), statistics.median(v)) for d, v in div_spreads.items() if len(v) >= 3),
                    key=lambda x: x[2], reverse=True)
    return {"items": items, "widest": widest, "tightest": tightest, "by_div": by_div,
            "min_jobs": min_jobs}


def catalog_confidence(con):
    """How well-backed is the catalog? Medians on <5 jobs shouldn't drive hard pricing rules."""
    total = con.execute("SELECT COUNT(*) FROM unit_costs").fetchone()[0]
    buckets = []
    for label, where in [
        ("High (>=30 jobs)", "n_jobs>=30"),
        ("Solid (10-29)", "n_jobs BETWEEN 10 AND 29"),
        ("Usable (5-9)", "n_jobs BETWEEN 5 AND 9"),
        ("Thin (2-4)", "n_jobs BETWEEN 2 AND 4"),
    ]:
        n = con.execute(f"SELECT COUNT(*) FROM unit_costs WHERE {where}").fetchone()[0]
        buckets.append((label, n))
    return total, buckets


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

    mk, tot_item, tot_sov = overall_markup(con)
    div_markup = markup_by_division(con)
    up = underpricing_unit_aware(con)
    cons = consistency(con)
    cat_total, cat_buckets = catalog_confidence(con)

    margin_now = mk / (1 + mk)
    margin_target = TARGET_MARKUP / (1 + TARGET_MARKUP)
    rep_cost = REP_SELL / (1 + mk)
    sell_target = rep_cost * (1 + TARGET_MARKUP)
    uplift_job = sell_target - REP_SELL
    uplift_year = uplift_job * JOBS_PER_YEAR

    n_projects = con.execute("SELECT COUNT(DISTINCT project_id) FROM estimates").fetchone()[0]
    pct_under = 100 * up["n_under"] / up["n_matched"] if up["n_matched"] else 0
    clean_gap = up["total_gap"] - up["flagged_gap"]

    o = []
    o += ["# MHP Pricing Analysis", "",
          "*Profit leaks and pricing consistency, computed from real MHP bid history. "
          "Nothing here needs a new job won — it's all in how the work gets priced.*", "",
          f"Source: **{n_projects} projects**, "
          f"**{con.execute('SELECT COUNT(*) FROM line_items').fetchone()[0]:,} line items**, "
          f"**{cat_total} catalog items**. Bid data only — actuals (QuickBooks) not yet wired, so "
          "these are *bid* margins, not *realized* margins.", "",
          "---", "", "## 1. Markup is thin and flat", ""]
    o += [f"Across **{con.execute('SELECT COUNT(*) FROM line_items WHERE sov_total>0').fetchone()[0]:,} "
          f"priced lines**, MHP marks up **{mk*100:.1f}%** over direct cost — a gross margin of "
          f"**{margin_now*100:.1f}%** — and it's nearly identical in every division:", "",
          "| Division | Lines | Markup |", "|---|--:|--:|"]
    for d, n, m in div_markup:
        o.append(f"| {d.strip()} | {n:,} | {m*100:.1f}% |")
    o += ["",
          f"Flat markup across every division is the tell: it's a habit, not a decision. Overhead — "
          f"office, insurance, trucks, Rick's pay — comes *out* of that {margin_now*100:.0f}%, which is "
          f"why a busy year can still feel broke. Residential remodel GCs typically run **25-50%**.", "",
          f"Moving **{mk*100:.0f}% → {TARGET_MARKUP*100:.0f}%** (conservative) lifts margin "
          f"**{margin_now*100:.0f}% → {margin_target*100:.0f}%** on the same work:", "",
          f"- Representative job (~${REP_SELL:,} sell, ~${rep_cost:,.0f} cost) → reprice to "
          f"**${sell_target:,.0f}** = **+${uplift_job:,.0f} profit, same job.**",
          f"- Across ~{JOBS_PER_YEAR} jobs/year: **+${uplift_year:,.0f}/year**, pure margin.", "",
          "---", "", "## 2. Underbidding your own proven rates (unit-corrected)", ""]
    o += [f"> **Correction:** the earlier `PROFIT_OPPORTUNITIES.md` reported division gaps up to "
          f"**$381,691,192** (Electrical). That was a bug — the catalog was matched on description "
          f"alone, so per-each rates collided with per-sqft quantities. Those dollar figures are "
          f"**retracted**. Below, lines are matched on item *and unit*, so only like-for-like is "
          f"compared.", "",
          f"Of **{up['n_matched']:,} unit-rate lines** that matched a catalog item in the same unit, "
          f"**{up['n_under']:,} ({pct_under:.0f}%)** were bid *below* MHP's own historical median — a "
          f"median **{up['med_short']*100:.0f}% under** the proven rate. Money MHP has charged before "
          f"and quietly gave back.", "",
          f"Coverage (no silent drops): {up['n_unit_rate']:,} unit-rate lines total → "
          f"{up['n_no_unit']:,} skipped (no clean unit), {up['n_no_catalog']:,} skipped (item not in "
          f"catalog / too little history), **{up['n_matched']:,} compared**.", "",
          "Underbid gap by division — *matched units only*, big single-line outliers pulled out:", "",
          "| Division | Underbid lines | Gap on those lines* |", "|---|--:|--:|"]
    for d, n, gap in up["by_div"]:
        o.append(f"| {d.strip()} | {n:,} | ${gap:,.0f} |")
    o += ["",
          f"*\\*Gap = (your median − your bid) × qty, summed over matched lines. Spans multiple bid "
          f"versions, so read as ranking/direction. Total across all divisions: **${up['total_gap']:,.0f}**; "
          f"of that, **${up['flagged_gap']:,.0f}** sits in {len(up['flagged'])} flagged outlier line(s) "
          f"(>${LINE_GAP_FLAG:,} each) listed below — excluding those, **${clean_gap:,.0f}** is the "
          f"steady, believable leak.*", ""]
    if up["flagged"]:
        o += ["Flagged single-line gaps (verify these by hand — likely a big-qty line or a "
              "mis-keyed unit, not a real per-line giveaway):", "",
              "| Division | Item | Unit | Bid | Median | Qty | Line gap |", "|---|---|---|--:|--:|--:|--:|"]
        for d, cd, nu, bid, med, qty, gap in up["flagged"][:10]:
            o.append(f"| {d.strip()[:18]} | {cd[:28]} | {nu} | ${bid:,.2f} | ${med:,.2f} | "
                     f"{qty:,.0f} | ${gap:,.0f} |")
        o.append("")
    o += ["---", "", "## 3. Pricing consistency", "",
          f"How tight is each catalog rate? **Spread = (p75 − p25) / median** (the typical band). "
          f"Restricted to items seen on **≥{cons['min_jobs']} jobs** so a fluke can't pose as a "
          f"pattern. Wide = the estimator is guessing or scope swings; tight = a reliable rate you "
          f"can lock today.", "",
          "### Loosest items — biggest pricing uncertainty (need a locked rate + contingency)", "",
          "| Item | Div | Unit | Jobs | p25 | Median | p75 | Spread |", "|---|---|---|--:|--:|--:|--:|--:|"]
    for it in cons["widest"]:
        o.append(f"| {it['desc'][:30]} | {it['div'].replace('Division ','').strip()[:10]} | {it['unit']} | "
                 f"{it['n_jobs']} | ${it['p25']:,.2f} | ${it['median']:,.2f} | ${it['p75']:,.2f} | "
                 f"{it['spread']*100:.0f}% |")
    o += ["", "### Tightest items — proven rates, safe to lock", "",
          "| Item | Div | Unit | Jobs | p25 | Median | p75 | Spread |", "|---|---|---|--:|--:|--:|--:|--:|"]
    for it in cons["tightest"]:
        o.append(f"| {it['desc'][:30]} | {it['div'].replace('Division ','').strip()[:10]} | {it['unit']} | "
                 f"{it['n_jobs']} | ${it['p25']:,.2f} | ${it['median']:,.2f} | ${it['p75']:,.2f} | "
                 f"{it['spread']*100:.0f}% |")
    o += ["", "### Where pricing discipline is weakest (median spread by division)", "",
          "| Division | Items | Median spread |", "|---|--:|--:|"]
    for d, n, sp in cons["by_div"]:
        o.append(f"| {d.strip()} | {n} | {sp*100:.0f}% |")
    o += ["", "---", "", "## 4. Catalog confidence", "",
          f"How well-backed the {cat_total} catalog rates are — medians on thin job counts shouldn't "
          f"drive hard pricing rules:", "",
          "| Backing | Items |", "|---|--:|"]
    for label, n in cat_buckets:
        o.append(f"| {label} | {n} |")
    o += ["", "---", "", "## What to do (in order of payback)", "",
          f"1. **Raise the markup floor.** Per-job-type minimum (e.g. {TARGET_MARKUP*100:.0f}% on "
          "remodels); price *up* to it, not down from a gut number. Single biggest lever here.",
          "2. **Hard-stop on sub-median rates.** When a bid line falls below the catalog median for "
          "that item+unit, flag it before the estimate ships — the brain already does this in reprice "
          "mode; now it's unit-correct.",
          "3. **Lock the tight items, pad the loose ones.** Items in §3's tight list become fixed "
          "reference rates; the loose list carries contingency sized off its p25-p75 band.",
          "4. **Wire actuals (QuickBooks).** Graduates every number here from *bid* margin to "
          "*realized* margin — catches jobs that bled after the bid, not just ones underpriced at bid.", "",
          "---",
          f"\n*Generated from {n_projects} projects of real MHP bid history. Markup figures are exact "
          "ratios; underpricing is unit-matched against MHP's own catalog; dollar projections are "
          "modeled on a representative job and labeled. Final pricing targets are James + Rick's call.*"]

    OUT.write_text("\n".join(o) + "\n")
    con.close()
    print(f"Wrote {OUT.name}")
    print(f"  markup {mk*100:.1f}% (margin {margin_now*100:.1f}%) -> {TARGET_MARKUP*100:.0f}% "
          f"= +${uplift_year:,.0f}/yr modeled")
    print(f"  underpriced: {up['n_under']:,}/{up['n_matched']:,} matched lines ({pct_under:.0f}%), "
          f"median {up['med_short']*100:.0f}% under; clean gap ${clean_gap:,.0f} "
          f"(+${up['flagged_gap']:,.0f} in {len(up['flagged'])} flagged outliers)")
    print(f"  consistency: {len(cons['items'])} items >= {cons['min_jobs']} jobs; "
          f"loosest division spread {cons['by_div'][0][2]*100:.0f}% ({cons['by_div'][0][0].strip()})")


if __name__ == "__main__":
    main()
