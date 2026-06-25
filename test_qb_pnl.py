"""Per-job P&L money math — integration proof over temp fixtures.

test_labor_cost.py covers the line-level allocation + labor isolation. This covers the rest of
the money path: load_bid_data (CLEAN-only bid + its pre-markup cost) and compute_pnl's roll-up
(revenue/cost/margin, loss classification, and the bid comparison that now uses the estimate's
OWN cost instead of a guessed markup — Phase 1.3).

Run:  python3 test_qb_pnl.py
"""
import json
import sqlite3
import tempfile
from pathlib import Path

import qb_pnl as q


def _estimates_db(path, rows):
    """rows: (project_id, sum_sov_total, sum_item_total, parse_confidence)"""
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE estimates (project_id TEXT, sum_sov_total REAL, sum_item_total REAL, parse_confidence TEXT, est_date TEXT)")
    con.executemany("INSERT INTO estimates VALUES (?,?,?,?,?)", [(*r, "2024-01-01") for r in rows])
    con.commit()
    con.close()


def test_load_bid_data():
    tmp = Path(tempfile.mkdtemp()) / "mhp.db"
    _estimates_db(tmp, [
        ("jooste", 150000, 120000, "CLEAN"),
        ("jooste", 90000, 70000, "CLEAN"),     # smaller CLEAN — the MAX should win
        ("jooste", 999999, 1, "FLAGGED"),      # must be excluded despite being largest
        ("moore", 50000, 41000, "CLEAN"),
    ])
    q.DB_PATH = tmp
    bids = q.load_bid_data()
    assert bids["jooste"]["bid"] == 150000, "largest CLEAN sov wins"
    assert bids["jooste"]["est_cost"] == 120000, "pre-markup cost comes from the same row"
    assert bids["moore"]["bid"] == 50000
    assert "999999" not in str(bids["jooste"]), "FLAGGED estimate must be excluded"
    print("  [ok] load_bid_data — CLEAN-only, MAX sov, carries pre-markup cost")


def test_compute_pnl_money_math():
    d = Path(tempfile.mkdtemp())
    data = d / "qb_data"
    data.mkdir()
    db = d / "mhp.db"
    _estimates_db(db, [("jooste", 150000, 120000, "CLEAN")])

    (data / "qb_job_map.json").write_text(json.dumps([
        {"qb_id": "55", "qb_name": "Jooste", "project_id": "jooste", "confidence": "high"},
    ]))
    # One bill (cost 100k, tagged to job 55) and one invoice (revenue 130k).
    (data / "qb_bills.json").write_text(json.dumps([
        {"TotalAmt": 100000, "Line": [
            {"Amount": 100000, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Materials"}, "CustomerRef": {"value": "55"}}},
        ]},
    ]))
    (data / "qb_invoices.json").write_text(json.dumps([
        {"Line": [{"Amount": 130000, "SalesItemLineDetail": {"CustomerRef": {"value": "55"}}}]},
    ]))

    q.DATA_DIR = data
    q.DB_PATH = db
    results, untagged_cost, untagged_rev, untagged_labor = q.compute_pnl()

    assert len(results) == 1
    r = results[0]
    assert r["cost"] == 100000 and r["revenue"] == 130000, f"cost/revenue off: {r}"
    assert r["gross_margin"] == 30000, "revenue - cost"
    assert r["loss_tier"] == "PROFITABLE"
    assert untagged_cost == 0 and untagged_rev == 0 and untagged_labor == 0

    bc = r["bid_comparison"]
    # Phase 1.3: variance vs the estimate's OWN pre-markup cost (120k), not a guessed markup.
    assert bc["expected_cost"] == 120000, "expected cost = estimate sum_item_total"
    assert bc["cost_variance"] == 100000 - 120000, "actual cost minus the bid's own cost"
    assert abs(bc["margin_bid"] - 20.0) < 1e-9, "(150k-120k)/150k = 20% bid margin"
    print("  [ok] compute_pnl — revenue/cost/margin, PROFITABLE, honest bid comparison")


def test_untagged_multi_job_not_dumped_on_header():
    # End-to-end version of the Phase 1.1 fix: a multi-job bill with an untagged line must
    # leave that line in untagged_cost, not pile it onto the header job's cost.
    d = Path(tempfile.mkdtemp())
    data = d / "qb_data"
    data.mkdir()
    db = d / "mhp.db"
    _estimates_db(db, [])

    (data / "qb_job_map.json").write_text(json.dumps([
        {"qb_id": "55", "qb_name": "JobA", "project_id": "a", "confidence": "high"},
    ]))
    (data / "qb_bills.json").write_text(json.dumps([
        {"CustomerRef": {"value": "55"}, "TotalAmt": 1700, "Line": [
            {"Amount": 1200, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Materials"}, "CustomerRef": {"value": "55"}}},
            {"Amount": 500, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Materials"}}},  # untagged
        ]},
    ]))

    q.DATA_DIR = data
    q.DB_PATH = db
    results, untagged_cost, _rev, _labor = q.compute_pnl()
    a = next(r for r in results if r["qb_id"] == "55")
    assert a["cost"] == 1200, f"only the tagged $1,200 attaches to the job, got {a['cost']}"
    assert untagged_cost == 500, f"the untagged $500 stays unallocated, got {untagged_cost}"
    print("  [ok] compute_pnl — untagged multi-job line stays unallocated, not on the header")


if __name__ == "__main__":
    print("\nPer-job P&L money-math proof")
    print("=" * 70)
    test_load_bid_data()
    test_compute_pnl_money_math()
    test_untagged_multi_job_not_dumped_on_header()
    print("=" * 70)
    print("PASS — bids CLEAN-only, P&L roll-up correct, bid comparison honest, no misallocation.")
    print("=" * 70)
