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
    "sqft": ["sqft", "sq ft", "sf", "square foot", "square feet", "sqft feet"],
    "lft": ["lft", "lf", "lnft", "linear foot", "linear feet", "ln ft"],
    "each": ["each", "ea", "ea.", "eact"],
    "cy": ["cy", "cubic yard", "cubic yards", "cdy"],   # NOTE: bare 'yard' is ambiguous (carpet=sq-yd) — resolved item-aware below
    "square": ["square", "per square", "sq"],
    "thousand": ["per thousand", "thousand"],
    "board feet": ["board feet", "board ft", "board ft.", "board"],
    "hour": ["hour", "hr", "hrs"],
    "windows exterior": ["windows exterior", "windows&exterior"],
}


def canon(desc):
    """Canonical description key — robust to case and stray whitespace (the 'Drywall ' bug)."""
    return re.sub(r"\s+", " ", str(desc or "")).strip().lower()


def canon_division(raw):
    """Clean, consistent division label: 'Division N: Name'.

    Source headers come through verbatim, so spacing is ragged ('Division 1:' vs
    'Division 10:  '). This standardizes formatting WITHOUT changing the division
    name MHP chose — it's a labeling cleanup, not a re-taxonomy. Names are preserved
    exactly (incl. 'Metal', '(Doors & Windows)'); only whitespace/format is normalized.
    """
    if not raw:
        return raw
    m = re.match(r"\s*division\s+(\d+)\s*:\s*(.+)", str(raw), re.I)
    if not m:
        return re.sub(r"\s+", " ", str(raw)).strip()
    num, name = int(m.group(1)), re.sub(r"\s+", " ", m.group(2)).strip()
    return f"Division {num}: {name}"


# Aggregate rows that ride along in the template but are NOT real line items —
# they're division/grand subtotals. Labeled SUBTOTAL so they stop polluting IRREGULAR
# and are cleanly excluded from the cost catalog.
SUBTOTAL_DESCS = {"all subtotals", "subtotal", "subtotals", "grand total", "total"}


def is_subtotal(desc):
    return canon(desc) in SUBTOTAL_DESCS


def norm_unit(u):
    if not u:
        return None
    s = re.sub(r"\s+", " ", str(u)).strip().lower().rstrip(".")
    s = re.sub(r"^per\s+", "", s)                       # "per door" -> "door"
    s = re.sub(r"[/ ]allowance$", "", s).strip()        # "sqft/allowance" -> "sqft" (allowance is a flag, not a unit)
    for canon, aliases in UNIT_ALIASES.items():
        if s in aliases:
            return canon
    return s or None


def resolve_unit(canon_desc, nu):
    """Item-aware fix for scope-words that mean different measures per item.

    Some sheets write the *location/scope* in the unit column instead of a measure:
      'per interior'/'per exterior' = sqft for area work (paint, electrical) but 'each' for
      counted items (doors); 'under roof sqft' = sqft. And 'yard' = cubic yard for concrete/sand
      but *square* yard for carpet. A flat alias map would convert carpet to cubic yards — so the
      true unit is resolved from the line's description, not the string alone.
    """
    d = canon_desc or ""
    if nu in ("interior", "exterior", "under roof sqft"):
        return "each" if "door" in d else "sqft"
    if nu in ("yard", "yards"):
        return "sqyd" if "carpet" in d else "cy"
    return nu


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
    """)
    # Idempotent: only add the Layer-1 label columns the first time (re-runs must not crash).
    existing = {r[1] for r in con.execute("PRAGMA table_info(line_items)")}
    for col in ("norm_unit", "price_kind", "canon_desc"):
        if col not in existing:
            con.execute(f"ALTER TABLE line_items ADD COLUMN {col} TEXT")

    rows = con.execute("""SELECT id,item_no,division,description,qty,unit,unit_price,item_total,estimate_id
                          FROM line_items""").fetchall()
    # Superseded revisions stay in line_items (real history) but are kept OUT of the catalog
    # so one re-saved job isn't double-weighted in the medians.
    superseded = {r[0] for r in con.execute("SELECT id FROM estimates WHERE parse_confidence='SUPERSEDED'")}
    unit_b = {}   # (item_no, canon, unit) -> {div,desc,prices:[(up,eid)]}
    lump_b = {}   # (item_no, canon)       -> {div,desc,totals:[(it,eid)]}
    counts = {"UNIT_RATE": 0, "LUMP_SUM": 0, "IRREGULAR": 0, "SUBTOTAL": 0}
    for lid, ino, div, desc, qty, unit, up, it, eid in rows:
        cd = canon(desc)
        nu = resolve_unit(cd, norm_unit(unit))
        div = canon_division(div)
        kind = "SUBTOTAL" if is_subtotal(desc) else classify(qty, up, it)
        counts[kind] += 1
        con.execute("UPDATE line_items SET norm_unit=?, price_kind=?, canon_desc=?, division=? WHERE id=?",
                    (nu, kind, cd, div, lid))
        ino = (str(ino).strip() if ino else None)
        if eid in superseded:
            continue  # excluded from catalog (still labeled above)
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
          f"{counts['UNIT_RATE']} unit-rate, {counts['LUMP_SUM']} lump-sum, "
          f"{counts['IRREGULAR']} irregular, {counts['SUBTOTAL']} subtotal")
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
