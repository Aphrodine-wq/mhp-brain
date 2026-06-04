"""Pricing Power Report — where MHP is leaving profit on the table, in dollars.

Two leaks, both computed from the real bid data, both fixable without winning a single
new job:

  1. MARKUP IS TOO THIN AND TOO FLAT.  Every division is marked up ~16% over direct cost.
     That's a ~14% gross margin — and office, insurance, trucks, and Rick's pay all come
     OUT of that. Residential remodel GCs typically need 30-50% markup to clear real net
     profit. Raising the markup lifts margin on every job you already win.

  2. UNDERPRICING vs YOUR OWN CATALOG.  On many lines MHP bid a unit rate BELOW its own
     proven median for that exact item — giving away money it has historically charged.

Markup is a ratio (sov/item), so version-duplication in the data doesn't bias it. Absolute
dollar figures are modeled on a representative job and labeled as such, so we never overstate
off the inflated line totals.

Run:  python3 profit_finder.py        ->  PROFIT_OPPORTUNITIES.md
"""
import sqlite3
import statistics
from pathlib import Path

DB = Path(__file__).parent / "mhp.db"
OUT = Path(__file__).parent / "PROFIT_OPPORTUNITIES.md"

# Representative residential job (from the book: ~$126k avg sell, ~16% markup).
REP_SELL = 126000
TARGET_MARKUP = 0.25          # a conservative, defensible residential-remodel target
JOBS_PER_YEAR = 17            # mid of the 15-20 steady-state estimate


def overall_markup(con):
    item, sov = con.execute(
        "SELECT SUM(item_total), SUM(sov_total) FROM line_items "
        "WHERE sov_total>0 AND item_total>0").fetchone()
    return (sov - item) / item, item, sov


def markup_by_division(con):
    rows = con.execute(
        "SELECT division, COUNT(*), SUM(item_total), SUM(sov_total) FROM line_items "
        "WHERE sov_total>0 AND item_total>0 AND division IS NOT NULL "
        "GROUP BY division HAVING COUNT(*)>30 ORDER BY 2 DESC").fetchall()
    return [(d, n, (s - i) / i) for d, n, i, s in rows]


def underpricing(con):
    """Lines where MHP bid below its OWN catalog median for that item. Returns
    (n_underpriced, n_total, median_shortfall_pct, by_division[])."""
    cat = {cd: med for cd, med in con.execute(
        "SELECT canon_desc, median_unit_price FROM unit_costs WHERE median_unit_price>0")}
    rows = con.execute(
        "SELECT canon_desc, division, unit_price, qty FROM line_items "
        "WHERE price_kind='UNIT_RATE' AND unit_price>0 AND qty>0").fetchall()
    under = []
    div_gap = {}
    n_total = 0
    for cd, div, up, qty in rows:
        med = cat.get(cd)
        if not med:
            continue
        n_total += 1
        if up < med * 0.97:                       # >3% below own median
            shortfall = (med - up) / med
            under.append(shortfall)
            div_gap.setdefault(div or "?", []).append((med - up) * qty)
    by_div = sorted(((d, len(v), sum(v)) for d, v in div_gap.items()),
                    key=lambda x: x[2], reverse=True)[:8]
    med_short = statistics.median(under) if under else 0
    return len(under), n_total, med_short, by_div


def main():
    con = sqlite3.connect(DB)
    mk, tot_item, tot_sov = overall_markup(con)
    by_div = markup_by_division(con)
    n_under, n_total, med_short, div_gap = underpricing(con)

    margin_now = mk / (1 + mk)
    margin_target = TARGET_MARKUP / (1 + TARGET_MARKUP)

    # representative job uplift
    rep_cost = REP_SELL / (1 + mk)
    sell_target = rep_cost * (1 + TARGET_MARKUP)
    uplift_job = sell_target - REP_SELL
    uplift_year = uplift_job * JOBS_PER_YEAR

    o = []
    o += ["# MHP Pricing Power Report", "",
          "*Where the company is leaving profit on the table — in dollars, on work you already win.*",
          "", "Nothing here requires a single new job. It's all in how the work gets priced.", "",
          "---", "", "## Leak #1 — your markup is thin and flat", ""]
    o += [f"Across **{con.execute('SELECT COUNT(*) FROM line_items WHERE sov_total>0').fetchone()[0]:,} "
          f"priced lines**, MHP marks up **{mk*100:.1f}%** over direct cost — a gross margin of "
          f"**{margin_now*100:.1f}%**. And it's nearly identical in every division:", "",
          "| Division | Lines | Markup |", "|---|--:|--:|"]
    for d, n, m in by_div:
        o.append(f"| {d.strip()} | {n:,} | {m*100:.1f}% |")
    o += ["",
          f"That flatness is the tell: it's a habit, not a pricing decision. Overhead — office, "
          f"insurance, trucks, Rick's pay — all comes *out* of that {margin_now*100:.0f}%, which is "
          f"why a busy year can still feel broke.", "",
          "**The lever:** residential remodel GCs typically run **25-50% markup**. Moving from "
          f"**{mk*100:.0f}% → {TARGET_MARKUP*100:.0f}%** (conservative) lifts gross margin "
          f"**{margin_now*100:.0f}% → {margin_target*100:.0f}%** on the *same work*:", "",
          f"- Representative job (~${REP_SELL:,} sell, ~${rep_cost:,.0f} cost): "
          f"reprice to **${sell_target:,.0f}** → **+${uplift_job:,.0f} profit, same job.**",
          f"- Across ~{JOBS_PER_YEAR} jobs/year: **+${uplift_year:,.0f}/year** — pure margin, no new sales.",
          "",
          "Pull it per-job-type, not as a blanket number — some scopes carry more, some less. But "
          "the floor needs to come up.", "",
          "---", "", "## Leak #2 — you underbid your own proven rates", ""]
    pct = 100 * n_under / n_total if n_total else 0
    o += [f"On **{n_under:,} of {n_total:,} priced lines ({pct:.0f}%)**, MHP bid a unit rate "
          f"*below its own historical median* for that exact item — a median **{med_short*100:.0f}% "
          f"under** your proven price. You've charged more for the same work before; these lines "
          f"quietly gave it back.", "",
          "Biggest gaps by division (where to tighten first):", "",
          "| Division | Underbid lines | Gap on those lines* |", "|---|--:|--:|"]
    for d, n, gap in div_gap:
        o.append(f"| {d.strip()} | {n:,} | ${gap:,.0f} |")
    o += ["",
          "*\\*Gap = (your median − your bid) × qty, summed. Spans multiple bid versions, so treat "
          "as direction and ranking, not a single-year total — but every dollar is a rate you've "
          "actually charged before.*", "",
          "---", "", "## What to do (in order of payback)", "",
          f"1. **Raise the markup floor.** Set a per-job-type minimum (e.g. {TARGET_MARKUP*100:.0f}% "
          "on remodels) and have the estimator price *up* to it, not down from a gut number. Biggest "
          "single lever in this whole report.",
          "2. **Hard-stop on sub-median rates.** When a bid line falls below your catalog median, the "
          "estimate flags it before it goes out — like the brain already does in reprice mode.",
          "3. **Carry contingency by spread.** Items with a wide historical price band (volatile) "
          "should carry more contingency — the catalog already tracks p25/p75 to size it.",
          "4. **Wire actuals (QuickBooks)** so this report graduates from *bid* margin to *realized* "
          "margin — then it catches the jobs that bled after the bid, not just the ones underpriced "
          "at bid time.", "",
          "---",
          f"\n*Generated from {con.execute('SELECT COUNT(DISTINCT project_id) FROM estimates').fetchone()[0]} "
          "projects of real MHP bid history. Markup figures are exact ratios; dollar projections are "
          "modeled on a representative job and labeled. Final pricing targets are James + Rick's call.*"]

    OUT.write_text("\n".join(o) + "\n")
    con.close()
    print(f"Wrote {OUT.name}")
    print(f"  markup {mk*100:.1f}% (margin {margin_now*100:.1f}%)  ->  "
          f"target {TARGET_MARKUP*100:.0f}% = +${uplift_year:,.0f}/yr modeled")
    print(f"  underpriced lines: {n_under:,}/{n_total:,} ({pct:.0f}%), median {med_short*100:.0f}% under own rate")


if __name__ == "__main__":
    main()
