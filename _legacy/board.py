"""Command board — the at-a-glance admin snapshot.

Pipeline by stage (count + dollars), an aging breakdown of the live book, and a live data-health
strip (the discrepancy audit, surfaced where an admin actually looks). Status reflects admin
overrides; project value uses the canonical (final) estimate, not the inflated revision pile.
"""
import sqlite3
from pathlib import Path

import admin

DB = Path(__file__).parent / "mhp.db"

STAGE_ORDER = ["Active", "Aging", "Bid", "Paused", "Likely Done", "Unknown", "Dead"]
LIVE = {"Active", "Aging", "Bid"}


def _months(a, b):
    try:
        return (int(b[:4]) - int(a[:4])) * 12 + (int(b[5:7]) - int(a[5:7]))
    except (ValueError, IndexError, TypeError):
        return None


def board_data():
    con = admin.connect()
    admin.ensure_tables(con)
    pov = admin.overlay(con, "project")
    today = admin.today_month()

    # canonical (final) bid value per project
    value = dict(con.execute(
        "SELECT project_id, sum_sov_total FROM canonical_estimates WHERE sum_sov_total>0"))

    rows = con.execute("SELECT id,name,status,last_activity FROM projects").fetchall()
    pipeline = {s: {"status": s, "count": 0, "value": 0} for s in STAGE_ORDER}
    aging = {"0-3 mo": 0, "3-6 mo": 0, "6-12 mo": 0, "12+ mo": 0, "no date": 0}
    live_total = active_total = 0

    for pid, name, status, la in rows:
        status = pov.get((pid, "status"), status)
        val = round(value.get(pid, 0))
        bucket = pipeline.setdefault(status, {"status": status, "count": 0, "value": 0})
        bucket["count"] += 1
        bucket["value"] += val
        if status in LIVE:
            live_total += val
            if status == "Active":
                active_total += val
            gap = _months(la, today) if la else None
            if gap is None:
                aging["no date"] += 1
            elif gap < 3:
                aging["0-3 mo"] += 1
            elif gap < 6:
                aging["3-6 mo"] += 1
            elif gap < 12:
                aging["6-12 mo"] += 1
            else:
                aging["12+ mo"] += 1

    pipe = [pipeline[s] for s in STAGE_ORDER if s in pipeline and pipeline[s]["count"]]
    pipe += [v for k, v in pipeline.items() if k not in STAGE_ORDER and v["count"]]

    # --- data health (the discrepancy audit, live) ---
    g = lambda q: con.execute(q).fetchone()[0]
    n_proj = g("SELECT COUNT(*) FROM projects")
    with_bids = g("SELECT COUNT(DISTINCT project_id) FROM canonical_estimates")
    total_lines = g("SELECT COUNT(*) FROM line_items")
    canon_lines = g("SELECT COUNT(*) FROM canonical_line_items")
    contaminated = g("SELECT COUNT(*) FROM unit_costs WHERE min_price>0 AND max_price/min_price>20")
    future_dates = g(f"SELECT COUNT(*) FROM projects WHERE last_activity>'{today}'")
    blank_markets = g("SELECT COUNT(*) FROM projects WHERE market IS NULL OR market=''")
    health = {
        "projects": n_proj, "with_bids": with_bids, "hollow": n_proj - with_bids,
        "total_lines": total_lines, "canon_lines": canon_lines,
        "inflation": round(total_lines / canon_lines, 2) if canon_lines else 0,
        "contaminated_rates": contaminated, "future_dates": future_dates,
        "blank_markets": blank_markets,
    }
    con.close()
    return {"pipeline": pipe, "aging": aging, "health": health,
            "live_value": round(live_total), "active_value": round(active_total)}
