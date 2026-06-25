"""
The actuals → catalog flywheel (ROADMAP.md Part 6, the moat).

Every closed job carries two numbers: what MHP **bid** (SOV total) and what it **actually**
came to (closeout total). The ratio is the lesson. This recomputes, from the full history of
closed jobs, a **realization factor** per dimension (portfolio / job type / market):

    realization = actual / bid          # 1.00 = landed on the bid; 1.08 = blew it by 8%
    factor      = EWMA of realizations  # recency-weighted (recent jobs dominate)

A new bid of $X for a job type then expects ~factor·$X to actually land — so a factor that
drifts above 1.0 means that job type is being **under-bid**, and the estimator can warn before
the bid goes out. The thing Procore/Buildertrend structurally can't do: they price off your
typing, this prices off your realized reality.

Two design choices that keep it honest:

  1. **Recompute from history, never mutate in place.** Like unit_costs, the factor table is
     DROP+rebuilt every run from the set of closed jobs. Deterministic, recomputable, no drift,
     no migration — and it sharpens automatically as QuickBooks + OCR fill in more actuals.

  2. **Shrink thin buckets toward 1.0 (no adjustment).** A factor learned from one job is not
     trustworthy. The reported factor is shrunk toward 1.0 by n/(n+K), so a 1-job bucket barely
     moves and a well-populated one is trusted. This is the principled form of "high-confidence
     rates move less" — it protects real bids from being steered by a single outlier.

The guard (same as test_actuals_loop.py): a job with no readable actual NEVER contributes — the
loop only learns from confirmed closeouts. Today ~4 jobs qualify; the moat compounds as the
QuickBooks pipe (qb_pnl.py / actuals_txn) and OCR ingest more closeouts.

Writes:  mhp.db  realization_factors  (derived; synced to Postgres by web/scripts/sync_to_pg.mjs,
         read by the web estimator via web/lib/flywheel.ts)

Run:  python3 flywheel.py            — rebuild factors, print the summary
      python3 flywheel.py --dry-run  — compute + print, write nothing
"""

import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "mhp.db"

ALPHA = 0.4      # EWMA recency weight — matches the proven loop (test_actuals_loop.py)
PRIOR_K = 3.0    # shrinkage prior strength: a bucket needs ~K jobs before its factor is half-trusted

# Job-type / market labels we don't group on — too vague to be a real signal on their own.
# These jobs still count toward the portfolio factor; they just don't form their own bucket.
BLANK_KEYS = {"", "unclassified", "unknown", "—", "n/a"}


# ---- the loop logic (pure, importable, unit-tested) ------------------------

def realization(bid, actual):
    """How much of the bid the job actually realized. 0.98 = came in 2% under."""
    if not bid or bid <= 0:
        raise ValueError("bid must be > 0")
    return actual / bid


def ewma_fold(values, alpha=ALPHA, start=1.0):
    """Fold a time-ordered list of realizations into one factor, recent jobs dominating.
    Starts from 1.0 (a bid with no history is assumed to land on the money)."""
    factor = start
    for v in values:
        factor = factor + alpha * (v - factor)
    return factor


def shrink_to_unity(factor, n, k=PRIOR_K):
    """Pull a factor toward 1.0 (no adjustment) by its confidence n/(n+k). n=1 barely moves;
    a well-populated bucket is mostly trusted. Protects bids from single-job noise."""
    if n <= 0:
        return 1.0
    w = n / (n + k)
    return 1.0 + (factor - 1.0) * w


def _stdev(values):
    """Sample stdev of the realizations — the spread is the confidence band. 0 for n<2."""
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return var ** 0.5


# ---- data: the closed jobs the loop learns from ---------------------------

def load_closed_jobs(con):
    """Every job with BOTH a CLEAN bid (largest SOV estimate) AND a closeout actual. The guard
    is structural: a job missing either side simply never appears here, so it can't teach the
    catalog anything. Ordered by est_date so the EWMA sees jobs in (approximate) time order —
    there's no close-date column, so the bid's est_date is the recency proxy."""
    rows = con.execute("""
        SELECT p.id AS project_id,
               COALESCE(p.type, '')   AS type,
               COALESCE(p.market, '') AS market,
               b.bid                  AS bid,
               act.actual             AS actual,
               COALESCE(b.est_date, '') AS est_date
        FROM projects p
        JOIN (
            SELECT project_id, MAX(closing_total) AS actual
            FROM actuals WHERE closing_total > 0 GROUP BY project_id
        ) act ON act.project_id = p.id
        JOIN (
            SELECT e.project_id, e.sum_sov_total AS bid, e.est_date
            FROM estimates e
            JOIN (
                SELECT project_id, MAX(sum_sov_total) AS mx
                FROM estimates
                WHERE sum_sov_total > 0 AND parse_confidence = 'CLEAN'
                GROUP BY project_id
            ) m ON m.project_id = e.project_id AND m.mx = e.sum_sov_total
            WHERE e.parse_confidence = 'CLEAN'
            GROUP BY e.project_id
        ) b ON b.project_id = p.id
    """).fetchall()

    jobs = []
    for project_id, type_, market, bid, actual, est_date in rows:
        jobs.append({
            "project_id": project_id,
            "type": type_,
            "market": market,
            "bid": float(bid),
            "actual": float(actual),
            "est_date": est_date,
            "realization": realization(float(bid), float(actual)),
        })
    # Stable chronological order for the EWMA (blank dates sort first — oldest assumption).
    jobs.sort(key=lambda j: (j["est_date"], j["project_id"]))
    return jobs


def _factor_row(dimension, key, jobs):
    """Build one realization_factors row from the jobs in a bucket (already time-ordered)."""
    reals = [j["realization"] for j in jobs]
    n = len(reals)
    raw = ewma_fold(reals)
    return {
        "dimension": dimension,
        "key": key,
        "factor": round(shrink_to_unity(raw, n), 4),
        "raw_factor": round(raw, 4),
        "n_jobs": n,
        "realization_mean": round(sum(reals) / n, 4),
        "realization_stdev": round(_stdev(reals), 4),
    }


def compute_factors(jobs):
    """Realization factors per dimension. Portfolio sees every closed job; type/market form a
    bucket only when their label is meaningful (BLANK_KEYS are pooled into portfolio only)."""
    rows = []
    if jobs:
        rows.append(_factor_row("portfolio", "all", jobs))

    for dim in ("type", "market"):
        buckets = defaultdict(list)
        for j in jobs:
            key = (j[dim] or "").strip()
            if key.lower() in BLANK_KEYS:
                continue
            buckets[key].append(j)
        for key, bucket in buckets.items():
            rows.append(_factor_row(dim, key, bucket))
    return rows


def write_factors(con, rows):
    """DROP+rebuild the derived table — same lifecycle as unit_costs, so the factors are always
    a clean recomputation of the current history, never a drifting accumulator."""
    con.execute("DROP TABLE IF EXISTS realization_factors")
    con.execute("""
        CREATE TABLE realization_factors (
            dimension         TEXT NOT NULL,
            key               TEXT NOT NULL,
            factor            REAL NOT NULL,   -- shrink-adjusted (use this for bidding)
            raw_factor        REAL NOT NULL,   -- EWMA before shrinkage
            n_jobs            INTEGER NOT NULL,
            realization_mean  REAL,
            realization_stdev REAL,
            updated_at        TEXT NOT NULL,
            PRIMARY KEY (dimension, key)
        )
    """)
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        con.execute(
            """INSERT INTO realization_factors
               (dimension, key, factor, raw_factor, n_jobs, realization_mean, realization_stdev, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (r["dimension"], r["key"], r["factor"], r["raw_factor"], r["n_jobs"],
             r["realization_mean"], r["realization_stdev"], now),
        )
    con.commit()


def main():
    dry_run = "--dry-run" in sys.argv
    if not DB_PATH.exists():
        print(f"  No mhp.db at {DB_PATH} — run the pipeline first.")
        return

    con = sqlite3.connect(DB_PATH)
    jobs = load_closed_jobs(con)
    rows = compute_factors(jobs)

    print("=" * 72)
    print("ACTUALS → CATALOG FLYWHEEL")
    print("=" * 72)
    print(f"\n  Closed jobs with a confirmed actual (the training set): {len(jobs)}")
    for j in jobs:
        print(f"    {j['project_id'][:38]:<38} bid ${j['bid']:>10,.0f} | "
              f"actual ${j['actual']:>10,.0f} | realized {j['realization']:.3f}")

    if not rows:
        print("\n  No factors yet — needs closed jobs with both a CLEAN bid and a closeout actual.")
        print("  Fills in as QuickBooks (qb_pnl.py) and OCR ingest more closeouts.")
        con.close()
        return

    print("\n  Realization factors (factor = shrink-adjusted; use this for bidding):\n")
    print(f"    {'dimension':<10} {'key':<26} {'factor':>7} {'raw':>7} {'n':>3} {'mean':>7} {'±stdev':>7}")
    for r in sorted(rows, key=lambda x: (x["dimension"] != "portfolio", x["dimension"], -x["n_jobs"])):
        print(f"    {r['dimension']:<10} {r['key'][:26]:<26} {r['factor']:>7.3f} "
              f"{r['raw_factor']:>7.3f} {r['n_jobs']:>3} {r['realization_mean']:>7.3f} "
              f"{r['realization_stdev']:>7.3f}")

    if dry_run:
        print("\n  --dry-run: nothing written.")
    else:
        write_factors(con, rows)
        print(f"\n  Wrote {len(rows)} factors to {DB_PATH} (realization_factors).")
        print("  Synced to Postgres by web/scripts/sync_to_pg.mjs; read via web/lib/flywheel.ts.")
    con.close()


if __name__ == "__main__":
    main()
