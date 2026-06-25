"""
Per-job Profit & Loss from downloaded QuickBooks data.

Usage:
  python qb_pnl.py                  — compute P&L for all mapped jobs
  python qb_pnl.py --losses         — show only jobs that lost money
  python qb_pnl.py --job <name>     — detail for one job
  python qb_pnl.py --verify-accounts — list QB expense accounts + which count as labor
                                       (run once after the first pull; reconcile vs the
                                       real chart of accounts before trusting labor numbers)

Reads:
  qb_data/qb_job_map.json        (from qb_match.py)
  qb_data/qb_bills.json          (costs — what MHP paid)
  qb_data/qb_invoices.json       (revenue — what MHP billed)
  qb_data/qb_payments.json       (collected — what clients actually paid)
  qb_data/qb_vendor_credits.json (cost reductions)
  qb_data/qb_time_activities.json (labor hours)
  mhp.db                         (estimates — what was bid)

Writes:
  qb_data/qb_pnl.json            (per-job P&L with completeness scores)
  mhp.db  qb_job_costs           (per-job actual labor/total cost, trusted matches only;
                                  synced to Postgres by web/scripts/sync_to_pg.mjs, read
                                  by the job page's labor-variance panel)
"""

import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).parent / "qb_data"
DB_PATH = Path(__file__).parent / "mhp.db"


def load_json(name):
    fpath = DATA_DIR / name
    if not fpath.exists():
        return []
    return json.loads(fpath.read_text())


def customer_ref_id(txn):
    """Extract the customer/job ID from a QB transaction's CustomerRef."""
    ref = txn.get("CustomerRef")
    if ref:
        return str(ref.get("value", ""))
    return None


def customer_ref_name(txn):
    ref = txn.get("CustomerRef")
    if ref:
        return ref.get("name", "")
    return ""


def _line_detail(line):
    return (
        line.get("AccountBasedExpenseLineDetail")
        or line.get("ItemBasedExpenseLineDetail")
        or line.get("SalesItemLineDetail")
        or {}
    )


def _txn_has_line_tags(txn):
    """True if any line carries its own CustomerRef — i.e. the txn is explicitly multi-job."""
    return any(_line_detail(line).get("CustomerRef") for line in txn.get("Line", []))


def line_amounts_by_customer(txn):
    """
    Per-job dollar allocation for a multi-line QB txn (Bill / Invoice / VendorCredit).
    Returns (amounts, unallocated):
      amounts     {customer_id: dollars} from line-level CustomerRef tags
      unallocated dollars that can't be safely attributed to a specific job

    The safe rule: a line with its own CustomerRef goes to that job. Untagged lines are
    folded into the header customer ONLY when NO line on the txn is tagged — a genuine
    single-job txn. If SOME lines are tagged and some aren't, the untagged dollars are
    AMBIGUOUS (which of the several jobs?) and must NOT be dumped on the header job — that
    silently overstated the header and understated the rest. Those go to `unallocated` for
    review instead of fabricating a per-job number.
    """
    tagged = defaultdict(float)
    untagged_total = 0.0
    for line in txn.get("Line", []):
        cust_ref = _line_detail(line).get("CustomerRef")
        if cust_ref and str(cust_ref.get("value", "")):
            tagged[str(cust_ref.get("value", ""))] += float(line.get("Amount", 0))
        else:
            untagged_total += float(line.get("Amount", 0))

    if tagged:
        # Explicit line-level tagging present → untagged dollars are ambiguous, never header.
        return dict(tagged), untagged_total

    # No line-level tags → single-customer txn; header fallback is safe.
    header_cid = customer_ref_id(txn)
    total = untagged_total or float(txn.get("TotalAmt", 0))
    if header_cid:
        return {header_cid: total}, 0.0
    # No tags and no header — nothing to attribute.
    return {}, total


# Expense accounts that represent LABOR cost (vs material/other). Matched case-
# insensitively against each expense line's AccountRef name. This is the one
# assumption in the labor-variance path: it must be reconciled against MHP's
# actual QuickBooks chart of accounts the first time the book is pulled — wrong
# accounts here would fabricate a labor number, which is worse than none.
# To verify after the QB connect:
#   ./qb.sh -c "import json;print(sorted({l.get('AccountBasedExpenseLineDetail',{}).get('AccountRef',{}).get('name','') for b in json.load(open('qb_data/qb_bills.json')) for l in b.get('Line',[])}))"
# then add/remove patterns below to match the real labor/payroll accounts.
LABOR_ACCOUNT_PATTERNS = ("labor", "wages", "payroll", "crew")


def _is_labor_account(name):
    n = (name or "").lower()
    return any(p in n for p in LABOR_ACCOUNT_PATTERNS)


def labor_cost_by_customer(txn):
    """
    (amounts, unallocated) for the subset of an expense txn's lines posted to a labor
    account (LABOR_ACCOUNT_PATTERNS). Dollars-to-dollars, no rate assumed. Only
    AccountBasedExpenseLineDetail lines carry an AccountRef; item-based lines are skipped
    (they're material/assemblies, not booked labor).

    Same allocation rule as line_amounts_by_customer: a labor line keeps its own
    CustomerRef; an untagged labor line falls back to the header ONLY on a single-job txn.
    On a multi-job txn (some lines tagged) an untagged labor line is ambiguous → unallocated,
    never dumped on the header. Understating labor here fails safe (reads as "awaiting"),
    where misattributing it would fabricate a per-job labor number.
    """
    has_line_tags = _txn_has_line_tags(txn)
    amounts = defaultdict(float)
    unallocated = 0.0
    for line in txn.get("Line", []):
        detail = line.get("AccountBasedExpenseLineDetail")
        if not detail:
            continue
        if not _is_labor_account(detail.get("AccountRef", {}).get("name", "")):
            continue
        amt = float(line.get("Amount", 0))
        cid = str((detail.get("CustomerRef") or {}).get("value", ""))
        if cid:
            amounts[cid] += amt
        elif not has_line_tags:
            header_cid = customer_ref_id(txn)
            if header_cid:
                amounts[header_cid] += amt
            else:
                unallocated += amt
        else:
            unallocated += amt
    return dict(amounts), unallocated


def load_bid_data():
    """Load per project from mhp.db: the bid (SOV total) AND the estimate's OWN pre-markup
    cost (sum_item_total). Returns {project_id: {"bid": sov, "est_cost": item}}.

    est_cost is the honest baseline for a cost variance — the cost the bid itself implies —
    so we never divide the SOV by a guessed portfolio-wide markup. Bid and est_cost come
    from the SAME estimate row, so they stay internally consistent.
    """
    bids = {}
    if not DB_PATH.exists():
        return bids
    conn = sqlite3.connect(DB_PATH)
    # Only CLEAN estimates are trustworthy bids — FLAGGED (PHASE_ONLY, DUPLICATE_EXPORT)
    # or FAILED estimates would over/double-count a project's bid. Pick the largest CLEAN
    # estimate per project and carry its pre-markup cost from the same row.
    rows = conn.execute("""
        SELECT e.project_id, e.sum_sov_total AS bid, e.sum_item_total AS est_cost
        FROM estimates e
        JOIN (
            SELECT project_id, MAX(sum_sov_total) AS mx
            FROM estimates
            WHERE sum_sov_total > 0 AND parse_confidence = 'CLEAN'
            GROUP BY project_id
        ) m ON m.project_id = e.project_id AND m.mx = e.sum_sov_total
        WHERE e.parse_confidence = 'CLEAN'
        GROUP BY e.project_id
    """).fetchall()
    conn.close()
    for r in rows:
        bids[r[0]] = {"bid": r[1], "est_cost": r[2]}
    return bids


def compute_pnl():
    # Load the job map
    job_map_raw = load_json("qb_job_map.json")
    if not job_map_raw:
        print("ERROR: No job map. Run: python qb_match.py")
        sys.exit(1)

    # Build lookup: QB customer ID → map entry
    job_map = {}
    for entry in job_map_raw:
        job_map[entry["qb_id"]] = entry

    # Load QB data
    bills = load_json("qb_bills.json")
    invoices = load_json("qb_invoices.json")
    payments = load_json("qb_payments.json")
    vendor_credits = load_json("qb_vendor_credits.json")
    time_activities = load_json("qb_time_activities.json")

    # Load bid data
    bids = load_bid_data()

    # Accumulate per-job
    job_costs = defaultdict(float)       # bills + purchases
    job_labor_cost = defaultdict(float)  # bills posted to a labor account (dollars)
    job_revenue = defaultdict(float)     # invoices
    job_collected = defaultdict(float)   # payments received
    job_credits = defaultdict(float)     # vendor credits (reduce cost)
    job_labor_hours = defaultdict(float) # time activities
    job_cost_txns = defaultdict(int)
    job_rev_txns = defaultdict(int)
    job_has_labor = defaultdict(bool)

    untagged_cost = 0   # overhead, mis-tagged, OR ambiguous untagged lines on a multi-job txn
    untagged_rev = 0
    untagged_labor = 0  # labor lines we couldn't safely attribute (multi-job, untagged)

    # Process bills (cost side)
    for bill in bills:
        amounts, unalloc = line_amounts_by_customer(bill)
        untagged_cost += unalloc
        for cid, amt in amounts.items():
            job_costs[cid] += amt
            job_cost_txns[cid] += 1
        labor, labor_unalloc = labor_cost_by_customer(bill)
        untagged_labor += labor_unalloc
        for cid, amt in labor.items():
            job_labor_cost[cid] += amt

    # Process vendor credits (reduce cost). Ambiguous untagged credit lines are dropped
    # rather than guessed at a job — a credit applied to the wrong job would understate it.
    for vc in vendor_credits:
        amounts, _unalloc = line_amounts_by_customer(vc)
        for cid, amt in amounts.items():
            job_credits[cid] += amt

    # Process invoices (revenue side)
    for inv in invoices:
        amounts, unalloc = line_amounts_by_customer(inv)
        untagged_rev += unalloc
        for cid, amt in amounts.items():
            job_revenue[cid] += amt
            job_rev_txns[cid] += 1

    # Process payments (collected)
    for pay in payments:
        cid = customer_ref_id(pay)
        if cid:
            job_collected[cid] += float(pay.get("TotalAmt", 0))

    # Process time activities (labor)
    for ta in time_activities:
        cid = customer_ref_id(ta)
        if cid:
            hours = ta.get("Hours", 0) + ta.get("Minutes", 0) / 60
            job_labor_hours[cid] += hours
            job_has_labor[cid] = True

    # Build P&L per job
    all_cids = set(job_costs) | set(job_revenue) | set(job_collected)
    results = []

    for cid in sorted(all_cids):
        entry = job_map.get(cid, {})
        qb_name = entry.get("qb_name", f"QB#{cid}")
        project_id = entry.get("project_id")
        confidence = entry.get("confidence")

        cost = job_costs.get(cid, 0) - job_credits.get(cid, 0)
        revenue = job_revenue.get(cid, 0)
        collected = job_collected.get(cid, 0)
        labor_cost = job_labor_cost.get(cid, 0)
        labor_hrs = job_labor_hours.get(cid, 0)
        has_labor = job_has_labor.get(cid, False)

        gross_margin = revenue - cost
        gross_pct = (gross_margin / revenue * 100) if revenue > 0 else 0

        # Bid comparison (only on a TRUSTED match — a low/medium-confidence QB↔brain
        # match would attach the wrong project's bid and fabricate a cost variance).
        trusted_match = confidence in ("exact", "high")
        bidrow = bids.get(project_id) if (project_id and trusted_match) else None
        bid = bidrow["bid"] if bidrow else None
        est_cost = bidrow.get("est_cost") if bidrow else None
        bid_vs_actual = None
        if bid and bid > 0:
            # Variance vs the estimate's OWN pre-markup cost (per-job, honest). When the
            # estimate didn't record a pre-markup cost, leave it None rather than guess a
            # markup — a fabricated variance is worse than none.
            bid_margin = ((bid - est_cost) / bid * 100) if (est_cost and est_cost > 0) else None
            bid_vs_actual = {
                "bid": bid,
                "actual_cost": cost,
                "actual_revenue": revenue,
                "expected_cost": est_cost,                       # the estimate's own pre-markup cost
                "cost_variance": (cost - est_cost) if est_cost else None,
                "margin_bid": bid_margin,                        # from this estimate, not a portfolio guess
                "margin_actual": gross_pct,
            }

        # Completeness score (0-100)
        score = 0
        score += 25 if job_cost_txns.get(cid, 0) >= 3 else (job_cost_txns.get(cid, 0) * 8)
        score += 25 if job_rev_txns.get(cid, 0) >= 1 else 0
        score += 20 if has_labor else 0
        score += 15 if collected > 0 else 0
        score += 15 if bid else 0

        # Loss classification
        if gross_margin < 0:
            if score >= 70 and has_labor:
                loss_tier = "CONFIRMED_LOSS"
            elif score >= 40:
                loss_tier = "LIKELY_LOSS"
            else:
                loss_tier = "INCOMPLETE"
        elif revenue == 0 and cost > 0:
            loss_tier = "IN_PROGRESS"
        else:
            loss_tier = "PROFITABLE" if gross_margin > 0 else "BREAK_EVEN"

        results.append({
            "qb_id": cid,
            "qb_name": qb_name,
            "project_id": project_id,
            "match_confidence": confidence,
            "revenue": round(revenue, 2),
            "cost": round(cost, 2),
            "labor_cost": round(labor_cost, 2),
            "collected": round(collected, 2),
            "gross_margin": round(gross_margin, 2),
            "gross_pct": round(gross_pct, 1),
            "labor_hours": round(labor_hrs, 1),
            "has_labor": has_labor,
            "cost_txns": job_cost_txns.get(cid, 0),
            "rev_txns": job_rev_txns.get(cid, 0),
            "completeness": min(score, 100),
            "loss_tier": loss_tier,
            "bid_comparison": bid_vs_actual,
        })

    # Sort by gross margin (losses first)
    results.sort(key=lambda r: r["gross_margin"])

    return results, untagged_cost, untagged_rev, untagged_labor


def write_job_costs(results):
    """
    Persist per-job actual cost to mhp.db (job_costs table) so the ETL
    (web/scripts/sync_to_pg.mjs) carries it into Postgres, where the job page's
    labor-variance panel reads labor_cost. Only TRUSTED matches (exact/high) with
    a project_id are written — a loose match would attach the wrong job's cost.
    """
    if not DB_PATH.exists():
        return 0
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS qb_job_costs (
            project_id   TEXT PRIMARY KEY,
            qb_id        TEXT,
            labor_cost   REAL,
            total_cost   REAL,
            labor_hours  REAL,
            updated_at   TEXT
        )
    """)
    # Full rebuild each run — qb_pnl recomputes from the whole book every time.
    conn.execute("DELETE FROM qb_job_costs")
    written = 0
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for r in results:
        if r.get("match_confidence") not in ("exact", "high"):
            continue
        pid = r.get("project_id")
        if not pid:
            continue
        # Write labor_cost as NULL (not 0) when nothing posted to a labor account.
        # LABOR_ACCOUNT_PATTERNS is unverified against MHP's real chart of accounts,
        # so a $0 almost always means "account not matched," not "zero labor." A real
        # 0 would make the job page show actual=$0 / −100% variance and steer the next
        # bid off a fabricated number. NULL → the panel honestly reads "awaiting QB."
        labor_cost = r.get("labor_cost", 0)
        labor_cost_db = labor_cost if labor_cost and labor_cost > 0 else None
        conn.execute(
            "INSERT OR REPLACE INTO qb_job_costs (project_id, qb_id, labor_cost, total_cost, labor_hours, updated_at) VALUES (?,?,?,?,?,?)",
            (pid, r.get("qb_id"), labor_cost_db, r.get("cost", 0), r.get("labor_hours", 0), now),
        )
        written += 1
    conn.commit()
    conn.close()
    return written


def dump_accounts():
    """Print the distinct expense-account names QB posts to, flagging which ones currently
    match LABOR_ACCOUNT_PATTERNS. Run once after the first QB pull so a human can reconcile
    the labor-account list against MHP's real chart of accounts — wrong accounts would
    fabricate a per-job labor number, which is worse than none (the one assumption in the
    labor-variance path). Usage: python qb_pnl.py --verify-accounts
    """
    bills = load_json("qb_bills.json")
    names = sorted({
        ((line.get("AccountBasedExpenseLineDetail") or {}).get("AccountRef") or {}).get("name", "")
        for b in bills for line in b.get("Line", [])
    } - {""})
    if not names:
        print("  No expense accounts found — run the QB pull first (./qb_refresh.sh --full).")
        return
    print(f"\n  Expense accounts on {len(bills)} bills ({len(names)} distinct).")
    print(f"  [LABOR] = currently counted as labor (name contains one of {LABOR_ACCOUNT_PATTERNS}):\n")
    for n in names:
        print(f"    [{'LABOR' if _is_labor_account(n) else '     '}]  {n}")
    print("\n  Reconcile: every real labor/payroll account must read [LABOR]. If one doesn't,")
    print("  add a pattern to LABOR_ACCOUNT_PATTERNS in qb_pnl.py and re-run --verify-accounts.")
    print("  Until this is signed off, treat the labor-variance numbers as provisional.\n")


def main():
    if "--verify-accounts" in sys.argv:
        dump_accounts()
        return

    losses_only = "--losses" in sys.argv
    single_job = None
    if "--job" in sys.argv:
        idx = sys.argv.index("--job")
        if idx + 1 < len(sys.argv):
            single_job = sys.argv[idx + 1].lower()

    results, untagged_cost, untagged_rev, untagged_labor = compute_pnl()

    # Save full results
    out = DATA_DIR / "qb_pnl.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"\n  P&L for {len(results)} jobs saved to {out}")

    # Persist per-job actual cost for the dashboards (labor-variance panel reads this)
    written = write_job_costs(results)
    print(f"  job_costs: {written} trusted-match jobs written to mhp.db")

    # Summary
    profitable = [r for r in results if r["loss_tier"] == "PROFITABLE"]
    losses = [r for r in results if "LOSS" in r["loss_tier"]]
    in_progress = [r for r in results if r["loss_tier"] == "IN_PROGRESS"]

    total_rev = sum(r["revenue"] for r in results)
    total_cost = sum(r["cost"] for r in results)
    total_margin = total_rev - total_cost

    print(f"\n  === Portfolio P&L Summary ===")
    print(f"  Total revenue:    ${total_rev:>12,.0f}")
    print(f"  Total cost:       ${total_cost:>12,.0f}")
    print(f"  Gross margin:     ${total_margin:>12,.0f}  ({total_margin/total_rev*100:.1f}%)" if total_rev else "")
    print(f"  Untagged cost:    ${untagged_cost:>12,.0f}  (overhead, mis-tagged, or ambiguous multi-job lines)")
    print(f"  Untagged revenue: ${untagged_rev:>12,.0f}")
    if untagged_labor:
        print(f"  Unalloc. labor:   ${untagged_labor:>12,.0f}  (labor lines on multi-job bills, untagged — review)")
    print()
    print(f"  Profitable jobs:  {len(profitable)}")
    print(f"  Loss jobs:        {len(losses)}")
    print(f"  In progress:      {len(in_progress)}")
    print()

    # Filter for display
    if single_job:
        display = [r for r in results if single_job in r["qb_name"].lower() or single_job in (r["project_id"] or "").lower()]
        if not display:
            print(f"  No jobs matching '{single_job}'")
            return
    elif losses_only:
        display = losses
        print(f"  === Jobs that lost money ({len(losses)}) ===\n")
    else:
        display = results[:20]
        print(f"  === Top 20 (sorted by margin, worst first) ===\n")

    for r in display:
        flag = ""
        if r["loss_tier"] == "CONFIRMED_LOSS":
            flag = " *** CONFIRMED LOSS"
        elif r["loss_tier"] == "LIKELY_LOSS":
            flag = " ** LIKELY LOSS"

        print(f"  {r['qb_name'][:45]:<45}  rev ${r['revenue']:>10,.0f}  cost ${r['cost']:>10,.0f}  "
              f"margin ${r['gross_margin']:>10,.0f} ({r['gross_pct']:>5.1f}%)  "
              f"[{r['completeness']}% complete]{flag}")

        if r.get("bid_comparison") and (single_job or losses_only):
            bc = r["bid_comparison"]
            bid_margin = f"{bc['margin_bid']:.1f}%" if bc.get("margin_bid") is not None else "n/a"
            print(f"    Bid: ${bc['bid']:,.0f} | Actual cost: ${bc['actual_cost']:,.0f} | "
                  f"Bid margin: {bid_margin} | Actual margin: {bc['margin_actual']:.1f}%")

        if single_job:
            print(f"    Labor hours: {r['labor_hours']}")
            print(f"    Cost txns: {r['cost_txns']} | Revenue txns: {r['rev_txns']}")
            print(f"    Collected: ${r['collected']:,.0f}")
            print(f"    Match: {r['project_id']} ({r['match_confidence']})")

    print()


if __name__ == "__main__":
    main()
