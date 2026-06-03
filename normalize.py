"""Layer 1 — normalize raw line items into a trustworthy unit-cost library.

The raw `unit_price` column mixes two things:
  - TRUE UNIT RATES  (qty * unit_price == item_total, e.g. 938 sqft @ $3.65)
  - LUMP SUMS        (qty=1, unit_price == item_total, e.g. "Kitchen Cabinets" = $38,500)

Aggregating them together is what made Framing Labor read "$4-50/sqft". Layer 1 classifies every
line, normalizes unit labels, and builds a clean per-unit cost catalog from the UNIT_RATE lines only —
with median/p25/p75 so one weird bid can't move the number.
"""
import re
import sqlite3
import statistics
from pathlib import Path

DB = Path(__file__).parent / "mhp.db"
HERE = Path(__file__).parent

UNIT_ALIASES = {
    "sqft": ["sqft", "sq ft", "sf", "square foot", "square feet"],
    "lft": ["lft", "lf", "lnft", "linear foot", "linear feet", "ln ft"],
    "each": ["each", "ea", "ea."],
    "cy": ["cy", "yard", "yards", "cubic yard"],
    "square": ["square", "per square", "sq"],
    "thousand": ["per thousand", "thousand"],
}


def canon(desc):
    """Canonical description key — robust to case and stray whitespace (the 'Drywall ' bug)."""
    return re.sub(r"\s+", " ", str(desc or "")).strip().lower()


def norm_unit(u):
    if not u:
        return None
    s = re.sub(r"\s+", " ", str(u)).strip().lower().rstrip(".")
    for canon, aliases in UNIT_ALIASES.items():
        if s in aliases or any(s == a for a in aliases):
            return canon
    # strip leading "per " noise: "per door" -> "door"
    s = re.sub(r"^per\s+", "", s)
    return s or None


def classify(qty, unit_price, item_total):
    """UNIT_RATE | LUMP_SUM | IRREGULAR."""
    if not item_total or item_total <= 0:
        return "IRREGULAR"
    if qty and unit_price and qty > 0:
        ratio = (unit_price * qty) / item_total
        if 0.97 <= ratio <= 1.03:
            return "LUMP_SUM" if abs(qty - 1) < 1e-6 and abs(unit_price - item_total) < 0.01 else "UNIT_RATE"
    if (qty in (None, 0) or abs((qty or 1) - 1) < 1e-6) and unit_price and abs(unit_price - item_total) < 0.01:
        return "LUMP_SUM"
    return "IRREGULAR"


def quantile(vals, q):
    vals = sorted(vals)
    if len(vals) == 1:
        return vals[0]
    idx = q * (len(vals) - 1)
    lo, hi = int(idx), min(int(idx) + 1, len(vals) - 1)
    return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo)


def main():
    con = sqlite3.connect(DB)
    con.executescript("""
        DROP TABLE IF EXISTS unit_costs;
        DROP TABLE IF EXISTS lump_costs;
        CREATE TABLE unit_costs (
            item_no TEXT, canon_desc TEXT, division TEXT, description TEXT, unit TEXT,
            n_lines INTEGER, n_jobs INTEGER,
            median_unit_price REAL, p25 REAL, p75 REAL,
            min_price REAL, max_price REAL, kind TEXT
        );
        CREATE TABLE lump_costs (
            item_no TEXT, canon_desc TEXT, division TEXT, description TEXT,
            n_jobs INTEGER, median_total REAL, p25 REAL, p75 REAL
        );
        ALTER TABLE line_items ADD COLUMN norm_unit TEXT;
        ALTER TABLE line_items ADD COLUMN price_kind TEXT;
        ALTER TABLE line_items ADD COLUMN canon_desc TEXT;
    """)

    rows = con.execute("""SELECT id,item_no,division,description,qty,unit,unit_price,item_total,estimate_id
                          FROM line_items""").fetchall()
    unit_b = {}   # (item_no, canon, unit) -> {div,desc,prices:[(up,eid)]}
    lump_b = {}   # (item_no, canon)       -> {div,desc,totals:[(it,eid)]}
    counts = {"UNIT_RATE": 0, "LUMP_SUM": 0, "IRREGULAR": 0}
    for lid, ino, div, desc, qty, unit, up, it, eid in rows:
        nu = norm_unit(unit)
        cd = canon(desc)
        kind = classify(qty, up, it)
        counts[kind] += 1
        con.execute("UPDATE line_items SET norm_unit=?, price_kind=?, canon_desc=? WHERE id=?",
                    (nu, kind, cd, lid))
        ino = (str(ino).strip() if ino else None)
        if kind == "UNIT_RATE" and up and up > 0:
            b = unit_b.setdefault((ino, cd, nu), {"div": div, "desc": desc, "p": []})
            b["p"].append((up, eid))
        elif kind == "LUMP_SUM" and it and it > 0:
            b = lump_b.setdefault((ino, cd), {"div": div, "desc": desc, "t": []})
            b["t"].append((it, eid))

    for (ino, cd, unit), b in unit_b.items():
        prices = [p for p, _ in b["p"]]
        if len(prices) < 2:
            continue
        jobs = len({e for _, e in b["p"]})
        con.execute("INSERT INTO unit_costs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (ino, cd, b["div"], b["desc"], unit, len(prices), jobs,
                     round(statistics.median(prices), 2),
                     round(quantile(prices, 0.25), 2), round(quantile(prices, 0.75), 2),
                     round(min(prices), 2), round(max(prices), 2), "UNIT_RATE"))

    for (ino, cd), b in lump_b.items():
        totals = [t for t, _ in b["t"]]
        if len(totals) < 2:
            continue
        jobs = len({e for _, e in b["t"]})
        con.execute("INSERT INTO lump_costs VALUES (?,?,?,?,?,?,?,?)",
                    (ino, cd, b["div"], b["desc"], jobs, round(statistics.median(totals), 2),
                     round(quantile(totals, 0.25), 2), round(quantile(totals, 0.75), 2)))
    con.commit()

    total = sum(counts.values())
    n_unit = con.execute("SELECT COUNT(*) FROM unit_costs").fetchone()[0]
    n_lump = con.execute("SELECT COUNT(*) FROM lump_costs").fetchone()[0]
    print(f"Classified {total} lines: "
          f"{counts['UNIT_RATE']} unit-rate, {counts['LUMP_SUM']} lump-sum, {counts['IRREGULAR']} irregular")
    print(f"Built {n_unit} unit-cost + {n_lump} lump-sum entries (>=2 jobs), keyed by CSI item #")

    write_catalog(con)
    con.close()


def write_catalog(con):
    out = ["# MHP Unit-Cost Catalog (Layer 1, normalized)", "",
           "Median per-unit pricing from **true unit-rate lines only** (lump sums excluded). "
           "p25-p75 is the typical band; use median as the reference rate.", ""]
    out += ["| Division | Line item | Unit | Jobs | p25 | **Median** | p75 | Range |",
            "|---|---|---|--:|--:|--:|--:|--:|"]
    q = """SELECT division,description,unit,n_jobs,p25,median_unit_price,p75,min_price,max_price
           FROM unit_costs WHERE n_jobs>=3 ORDER BY n_jobs DESC, division"""
    for div, desc, unit, j, p25, med, p75, lo, hi in con.execute(q):
        d = (div or "").replace("Division ", "Div ")[:22]
        out.append(f"| {d} | {desc[:32]} | {unit or ''} | {j} | ${p25:,.2f} | **${med:,.2f}** | "
                   f"${p75:,.2f} | ${lo:,.0f}-${hi:,.0f} |")
    (HERE / "cost_catalog.md").write_text("\n".join(out) + "\n")
    print("Wrote cost_catalog.md")


if __name__ == "__main__":
    main()
