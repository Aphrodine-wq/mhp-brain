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
    labor, unalloc = q.labor_cost_by_customer(bill)
    assert abs(labor["55"] - 1500) < 1e-9, f"labor should be 1200+300, got {labor}"
    assert unalloc == 0, f"all lines tagged → nothing unallocated, got {unalloc}"
    print("  [ok] labor accounts summed (1200 labor + 300 payroll), material excluded")

    # Item-based lines (material/assemblies) carry no AccountRef -> never labor.
    item = {"Line": [{"Amount": 999, "ItemBasedExpenseLineDetail": {"CustomerRef": {"value": "9"}}}]}
    assert q.labor_cost_by_customer(item) == ({}, 0.0), "item-based line must not count as labor"
    print("  [ok] item-based (material) line excluded from labor")

    # Single-job bill (no line carries its own CustomerRef): the untagged labor line falls
    # back to the header customer — safe, because there's only one job on the bill.
    hdr = {"CustomerRef": {"value": "70"}, "Line": [
        {"Amount": 500, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Crew Wages"}}},
    ]}
    labor, unalloc = q.labor_cost_by_customer(hdr)
    assert labor == {"70": 500.0} and unalloc == 0.0, "single-job header fallback failed"
    print("  [ok] untagged labor on a single-job bill falls back to header customer")


def test_multi_job_untagged_not_header():
    # The fix for the silent-misallocation bug. A bill with one line tagged to job 55 and an
    # UNTAGGED labor line, header customer 70. The untagged dollars are ambiguous on a
    # multi-job bill and must NOT be dumped on the header — they go to `unallocated`.
    bill = {"CustomerRef": {"value": "70"}, "TotalAmt": 1700, "Line": [
        {"Amount": 1200, "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Materials"}, "CustomerRef": {"value": "55"}}},
        {"Amount": 500,  "AccountBasedExpenseLineDetail": {"AccountRef": {"name": "Job Labor"}}},  # untagged labor
    ]}
    labor, labor_unalloc = q.labor_cost_by_customer(bill)
    assert labor == {}, f"untagged labor on a multi-job bill must not attach to a job, got {labor}"
    assert abs(labor_unalloc - 500) < 1e-9, f"untagged labor should be unallocated, got {labor_unalloc}"

    amounts, cost_unalloc = q.line_amounts_by_customer(bill)
    assert amounts == {"55": 1200.0}, f"only the tagged line should attach to its job, got {amounts}"
    assert abs(cost_unalloc - 500) < 1e-9, f"the untagged $500 must be unallocated, not on header 70, got {cost_unalloc}"
    print("  [ok] untagged lines on a multi-job bill go to unallocated, never the header job")


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
    test_multi_job_untagged_not_header()
    test_write_guard()
    print("=" * 70)
    print("PASS — labor isolated to labor accounts, write guarded to trusted matches.")
    print("Remaining: verify LABOR_ACCOUNT_PATTERNS vs MHP's real chart of accounts on first QB pull.")
    print("=" * 70)
