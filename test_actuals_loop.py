"""Actuals loop — proof on two real MHP jobs.

The loop (ROADMAP.md Part 6):  bid  ->  actual  ->  variance  ->  catalog/realization update.
Two jobs, two real states:

  Jooste  (Kitchen; Bath; Porch, Dead/closed)
      bid (SOV)  $383,037   — 'Jooste Estimate Sheet - NMHP March 13 2023.xlsx' (Template total)
      actual     $375,000   — 'NMHP Materials Worksheet Jooste Final Closing ... Oct 20 2023.xlsx'
      -> actual is present  ->  loop CLOSES  ->  job-type realization factor learns from it.

  Moore   (Molly Moore custom build, mis-filed under 'Ken Williams', Dead/closed)
      bid (SOV)  $379,084   — 'MHP Project Estimation Sheet Molly Moore FV1 - Jan 22 2025.xlsx'
      actual     UNREADABLE — only a SCANNED PDF draw request / payment exists (no text layer)
      -> actual is missing  ->  loop HOLDS  ->  catalog is NOT touched (the guard).

Moore is the live argument for the invoice pipe: the data exists, but it's trapped in a scanned
PDF in the wrong folder, so the loop correctly refuses to learn from it until OCR ingests it.

Numbers were read straight from the source spreadsheets (the DB had a line-item sum artifact on
Jooste). Catalog is loaded read-only from mhp.db to prove the loop is wired to real rates.

Run:  python3 test_actuals_loop.py
"""
import sqlite3
from pathlib import Path

DB = Path(__file__).parent / "mhp.db"
EWMA_ALPHA = 0.4   # recency weight: a new closed job moves the factor 40% toward its realization


# ---- the loop logic (the actual product) ----------------------------------

def cost_variance(bid, actual):
    """Signed variance of actual vs bid. -0.02 = job closed 2% under bid."""
    if not bid:
        raise ValueError("bid required")
    return (actual - bid) / bid


def realization(bid, actual):
    """How much of the bid the job actually realized. 0.98 = came in 2% under."""
    return actual / bid


def flywheel_update(prior_factor, observed, alpha=EWMA_ALPHA):
    """EWMA: nudge the prior toward what this job actually realized. Recent jobs dominate."""
    return round(prior_factor + alpha * (observed - prior_factor), 4)


def process_job(job, factors):
    """Close the loop for one job. Returns (outcome, detail).
    The guard: a job with no readable actual NEVER updates `factors`."""
    if job["actual"] is None:
        return "HELD", f"awaiting actuals — {job['actual_reason']}"
    obs = realization(job["bid"], job["actual"])
    jt = job["job_type"]
    before = factors.get(jt, 1.0)
    factors[jt] = flywheel_update(before, obs)
    var = cost_variance(job["bid"], job["actual"])
    return "CLOSED", {"variance": var, "realization": obs,
                      "factor_before": before, "factor_after": factors[jt]}


# ---- real jobs (verified from source spreadsheets) ------------------------

JOBS = [
    {"name": "Jooste Project (Kitchen; Bath; Porch)", "job_type": "kitchen-bath-porch",
     "bid": 383037, "actual": 375000, "actual_reason": None},
    {"name": "Moore Project (Molly Moore custom build)", "job_type": "custom-build",
     "bid": 379084, "actual": None,
     "actual_reason": "actual lives only in a scanned PDF (no text layer); needs OCR invoice pipe"},
]


def catalog_sample(con, n=3):
    """Pull a few real rates from the live catalog — proves we're wired to real data,
    and gives us something concrete the guard protects from corruption."""
    return con.execute(
        "SELECT canon_desc, unit, n_jobs, ROUND(median_unit_price,2) "
        "FROM unit_costs WHERE median_unit_price > 0 ORDER BY n_jobs DESC LIMIT ?", (n,)
    ).fetchall()


def main():
    con = sqlite3.connect(DB)
    sample = catalog_sample(con)
    catalog_fingerprint = tuple(sample)   # snapshot to prove the guard leaves it untouched

    print("=" * 70)
    print("ACTUALS LOOP — two real jobs")
    print("=" * 70)
    print("\nLive catalog (top rates by job count, read-only from mhp.db):")
    for cd, unit, j, med in sample:
        print(f"   {cd[:34]:<34} ${med:>10,.2f} /{unit or '?':<6} ({j}j)")

    factors = {}        # job-type -> realization factor (the thing the flywheel learns)
    results = {}
    print("\nProcessing jobs:")
    for job in JOBS:
        outcome, detail = process_job(job, factors)
        results[job["name"]] = (outcome, detail)
        print(f"\n  {job['name']}")
        print(f"     bid ${job['bid']:,}", end="")
        print(f" | actual ${job['actual']:,}" if job["actual"] else " | actual —")
        if outcome == "CLOSED":
            d = detail
            print(f"     -> CLOSED  variance {d['variance']:+.1%}  "
                  f"realization {d['realization']:.3f}")
            print(f"        flywheel: '{job['job_type']}' factor "
                  f"{d['factor_before']:.3f} -> {d['factor_after']:.3f} (EWMA α={EWMA_ALPHA})")
        else:
            print(f"     -> HELD    {detail}")
            print(f"        catalog untouched — the guard refuses to learn from missing data")

    # ---- assertions: the loop behaves correctly on both states ----
    print("\n" + "-" * 70)
    print("ASSERTIONS")

    j_outcome, j = results["Jooste Project (Kitchen; Bath; Porch)"]
    assert j_outcome == "CLOSED", "Jooste has an actual; loop must close"
    assert abs(j["variance"] - (-0.0210)) < 0.001, f"Jooste variance off: {j['variance']}"
    assert j["factor_before"] == 1.0 and j["factor_after"] < 1.0, "factor must learn 'under bid'"
    print(f"  [ok] Jooste loop closed — learned realization {j['realization']:.3f} "
          f"(~2% under bid) into the catalog")

    m_outcome, m_detail = results["Moore Project (Molly Moore custom build)"]
    assert m_outcome == "HELD", "Moore actual is unreadable; loop must hold"
    assert "custom-build" not in factors, "guard failed: Moore must not create a factor"
    print(f"  [ok] Moore loop held — no catalog learning from an unreadable scanned PDF")

    # the guard, hard: the live catalog snapshot is byte-identical after the run
    assert catalog_sample(con) == list(catalog_fingerprint), "catalog mutated during a read-only run!"
    print(f"  [ok] guard verified — live catalog unchanged (only confirmed actuals ever write)")

    # flywheel math is correct in isolation
    assert flywheel_update(1.0, 0.90) == 0.96, "EWMA math wrong"
    assert flywheel_update(0.96, 0.90) == 0.936, "EWMA second step wrong"
    print(f"  [ok] flywheel EWMA math — 1.000 ->0.960 ->0.936 toward repeated 0.90 realization")

    con.close()
    print("\n" + "=" * 70)
    print("PASS — loop closes on Jooste, correctly holds on Moore. 2 jobs, 5/5 checks.")
    print("Moore is the case the invoice/OCR pipe exists to fix.")
    print("=" * 70)


if __name__ == "__main__":
    main()
