"""Flywheel — proof the learning loop is honest and deterministic.

Covers the four properties that make the moat safe to wire into real bidding:
  1. EWMA fold — recent jobs dominate, starting from 1.0 (no history → no adjustment).
  2. Shrinkage — a thin bucket (n=1) barely moves off 1.0; a populated one is trusted.
  3. The guard — a job with no actual never enters the training set, so it can't teach.
  4. Determinism — recompute-from-history yields byte-identical factors on a second run.

Plus a real-data smoke test over mhp.db so we know it's wired to the live catalog.

Run:  python3 test_flywheel.py
"""
import sqlite3
import tempfile
from pathlib import Path

import flywheel as f


def test_ewma_fold():
    # No history → factor stays at 1.0 (a bid with no past is assumed to land on the money).
    assert f.ewma_fold([]) == 1.0
    # Matches the proven loop's hand-checked sequence (test_actuals_loop.py).
    assert abs(f.ewma_fold([0.90]) - 0.96) < 1e-9, "1.0 -> 0.96 toward 0.90"
    assert abs(f.ewma_fold([0.90, 0.90]) - 0.936) < 1e-9, "second step -> 0.936"
    # Recency: the same two observations in the other order land differently.
    assert f.ewma_fold([1.2, 0.8]) != f.ewma_fold([0.8, 1.2]), "EWMA must be order-sensitive"
    print("  [ok] EWMA fold — starts at 1.0, recency-weighted, matches the proven loop")


def test_shrinkage():
    # A raw factor of 1.40 (40% over bid) from ONE job must barely move off 1.0.
    one = f.shrink_to_unity(1.40, 1)
    assert 1.0 < one < 1.12, f"n=1 should be heavily shrunk, got {one}"
    # The same raw factor from many jobs is mostly trusted.
    many = f.shrink_to_unity(1.40, 30)
    assert many > 1.33, f"n=30 should be mostly trusted, got {many}"
    assert many > one, "more jobs => closer to the raw factor"
    # Zero jobs => no adjustment at all.
    assert f.shrink_to_unity(1.40, 0) == 1.0
    print("  [ok] shrinkage — 1-job factor pulled toward 1.0, well-populated trusted")


def test_guard_excludes_jobs_without_actuals():
    # Build a tiny DB: two jobs, only one has a closeout actual. The flywheel must learn from
    # exactly one — the job with no actual is structurally invisible to load_closed_jobs.
    tmp = Path(tempfile.mkdtemp()) / "mhp.db"
    con = sqlite3.connect(tmp)
    con.executescript("""
        CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, type TEXT, market TEXT, status TEXT);
        CREATE TABLE estimates (id TEXT, project_id TEXT, sum_sov_total REAL, sum_item_total REAL,
                                parse_confidence TEXT, est_date TEXT);
        CREATE TABLE actuals (project_id TEXT, source_file TEXT, closing_total REAL);
        INSERT INTO projects VALUES ('p1','Closed Job','Kitchen','Oxford','Dead');
        INSERT INTO projects VALUES ('p2','Open Job','Kitchen','Oxford','Active');
        INSERT INTO estimates VALUES ('e1','p1',100000,85000,'CLEAN','2024-01-01');
        INSERT INTO estimates VALUES ('e2','p2',200000,170000,'CLEAN','2024-02-01');
        INSERT INTO actuals VALUES ('p1','close.xlsx',110000);  -- only p1 has an actual
    """)
    con.commit()
    jobs = f.load_closed_jobs(con)
    assert len(jobs) == 1 and jobs[0]["project_id"] == "p1", f"guard failed: {jobs}"
    assert abs(jobs[0]["realization"] - 1.10) < 1e-9, "110k / 100k = 1.10"
    rows = f.compute_factors(jobs)
    port = next(r for r in rows if r["dimension"] == "portfolio")
    assert port["n_jobs"] == 1, "only the closed job teaches the catalog"
    con.close()
    print("  [ok] guard — a job with no actual never enters the training set")


def test_determinism():
    # Recompute-from-history must be deterministic: same input, same factors, twice.
    jobs = [
        {"project_id": "a", "type": "Kitchen", "market": "Oxford", "bid": 100, "actual": 90,
         "est_date": "2024-01-01", "realization": 0.90},
        {"project_id": "b", "type": "Kitchen", "market": "Oxford", "bid": 100, "actual": 120,
         "est_date": "2024-03-01", "realization": 1.20},
        {"project_id": "c", "type": "Deck", "market": "Pickwick", "bid": 50, "actual": 55,
         "est_date": "2024-02-01", "realization": 1.10},
    ]
    assert f.compute_factors(jobs) == f.compute_factors(jobs), "factors must be deterministic"
    # Blank/vague type labels pool into portfolio only — they don't form their own bucket.
    vague = [{"project_id": "x", "type": "Unclassified", "market": "", "bid": 100, "actual": 100,
              "est_date": "2024-01-01", "realization": 1.0}]
    dims = {r["dimension"] for r in f.compute_factors(vague)}
    assert dims == {"portfolio"}, f"vague labels must not form type/market buckets, got {dims}"
    print("  [ok] determinism — identical recompute; vague labels pool into portfolio only")


def test_real_data_smoke():
    if not f.DB_PATH.exists():
        print("  [skip] no mhp.db — real-data smoke test skipped")
        return
    con = sqlite3.connect(f.DB_PATH)
    jobs = f.load_closed_jobs(con)
    rows = f.compute_factors(jobs)
    con.close()
    if not jobs:
        print("  [skip] mhp.db has no closed jobs with actuals yet")
        return
    port = next(r for r in rows if r["dimension"] == "portfolio")
    assert port["n_jobs"] == len(jobs), "portfolio counts every closed job"
    assert 0 < port["factor"], "factor must be positive"
    # Every reported factor is shrunk toward 1.0 — it can never be more extreme than its raw.
    for r in rows:
        assert abs(r["factor"] - 1.0) <= abs(r["raw_factor"] - 1.0) + 1e-9, \
            f"{r['dimension']}/{r['key']}: shrunk factor more extreme than raw"
    print(f"  [ok] real data — {len(jobs)} closed jobs, portfolio factor {port['factor']:.3f} "
          f"(±{port['realization_stdev']:.3f}, n={port['n_jobs']})")


if __name__ == "__main__":
    print("\nFlywheel proof")
    print("=" * 70)
    test_ewma_fold()
    test_shrinkage()
    test_guard_excludes_jobs_without_actuals()
    test_determinism()
    test_real_data_smoke()
    print("=" * 70)
    print("PASS — loop is honest (guard), confidence-aware (shrinkage), and deterministic.")
    print("Factor sharpens as QuickBooks + OCR ingest more confirmed closeouts.")
    print("=" * 70)
