"""Labor-cost extraction — proof the QB→variance pipe is honest.

Phase 2 of time tracking closes the loop: estimated labor (from the bid) vs ACTUAL
labor cost (from QuickBooks), dollars-to-dollars, no assumed rate (James's call,
2026-06-25). This proves the QB half:

  1. labor_cost_by_customer() pulls ONLY the expense lines posted to a labor account
     (LABOR_ACCOUNT_PATTERNS) — material lines and item-based lines are excluded.
  2. write_job_costs() persists per-job labor cost to mhp.db.qb_job_costs, but ONLY
     for TRUSTED matches with a project_id — a loose match would attach the wrong
     job's cost and fabricate a variance (the guard).

The web job page reads qb_job_costs.labor_cost; until QB is authorized the table is
empty and the panel honestly reads "awaiting QuickBooks".

Run:  python3 test_labor_cost.py
"""
import sqlite3
import tempfile
from pathlib import Path

import qb_pnl as q


def test_labor_classification():
    bill = {"TotalAmt": 3000, "Line": [
        {"Amount": 1200, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Job Labor"}, "CustomerRef": {"value": "55"}}},
        {"Amount": 1500, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Materials & Supplies"}, "CustomerRef": {"value": "55"}}},
        {"Amount": 300,  "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Payroll Expense"}, "CustomerRef": {"value": "55"}}},
    ]}
    labor = q.labor_cost_by_customer(bill)
    assert abs(labor["55"] - 1500) < 1e-9, f"labor should be 1200+300, got {labor}"
    print("  [ok] labor accounts summed (1200 labor + 300 payroll), material excluded")

    # Item-based lines (material/assemblies) carry no AccountRef -> never labor.
    item = {"Line": [{"Amount": 999, "ItemBasedExpenseLineDetail": {"CustomerRef": {"value": "9"}}}]}
    assert q.labor_cost_by_customer(item) == {}, "item-based line must not count as labor"
    print("  [ok] item-based (material) line excluded from labor")

    # Line tagged to no customer falls back to the header customer.
    hdr = {"CustomerRef": {"value": "70"}, "Line": [
        {"Amount": 500, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Crew Wages"}}},
    ]}
    assert q.labor_cost_by_customer(hdr) == {"70": 500.0}, "header-customer fallback failed"
    print("  [ok] untagged labor line falls back to header customer")


def test_write_guard():
    tmp = Path(tempfile.mkdtemp()) / "mhp.db"
    sqlite3.connect(tmp).close()
    q.DB_PATH = tmp
    results = [
        {"project_id": "p-trusted", "qb_id": "55", "match_confidence": "high",  "labor_cost": 1500, "cost": 3000, "labor_hours": 20},
        {"project_id": "p-loose",   "qb_id": "77", "match_confidence": "low",   "labor_cost": 800,  "cost": 1000, "labor_hours": 9},
        {"project_id": None,        "qb_id": "88", "match_confidence": "exact", "labor_cost": 50,   "cost": 60,   "labor_hours": 1},
    ]
    n = q.write_job_costs(results)
    rows = sqlite3.connect(tmp).execute("SELECT project_id, labor_cost, total_cost FROM qb_job_costs").fetchall()
    assert n == 1 and rows == [("p-trusted", 1500.0, 3000.0)], f"guard failed: n={n} rows={rows}"
    print("  [ok] only trusted match with project_id written; loose & null filtered (the guard)")


if __name__ == "__main__":
    print("\nLabor-cost extraction proof")
    print("=" * 70)
    test_labor_classification()
    test_write_guard()
    print("=" * 70)
    print("PASS — labor isolated to labor accounts, write guarded to trusted matches.")
    print("Remaining: verify LABOR_ACCOUNT_PATTERNS vs MHP's real chart of accounts on first QB pull.")
    print("=" * 70)
