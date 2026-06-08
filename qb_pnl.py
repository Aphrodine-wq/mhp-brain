"""
Per-job Profit & Loss from downloaded QuickBooks data.

Usage:
  python qb_pnl.py                — compute P&L for all mapped jobs
  python qb_pnl.py --losses       — show only jobs that lost money
  python qb_pnl.py --job <name>   — detail for one job

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


def line_amounts_by_customer(txn):
    """
    Some QB transactions (Bills, Invoices) have multiple lines tagged to different jobs.
    Return {customer_id: total_amount} across all line items.
    """
    amounts = defaultdict(float)
    for line in txn.get("Line", []):
        detail = (
            line.get("AccountBasedExpenseLineDetail")
            or line.get("ItemBasedExpenseLineDetail")
            or line.get("SalesItemLineDetail")
            or {}
        )
        cust_ref = detail.get("CustomerRef")
        if cust_ref:
            cid = str(cust_ref.get("value", ""))
            amounts[cid] += float(line.get("Amount", 0))
        else:
            # Untagged line — assign to the header-level customer if present
            header_cid = customer_ref_id(txn)
            if header_cid:
                amounts[header_cid] += float(line.get("Amount", 0))

    # If no line-level tagging, fall back to header
    if not amounts:
        cid = customer_ref_id(txn)
        if cid:
            amounts[cid] = float(txn.get("TotalAmt", 0))

    return dict(amounts)


def load_bid_data():
    """Load bid totals per project from mhp.db (the brain's estimate data)."""
    bids = {}
    if not DB_PATH.exists():
        return bids
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("""
        SELECT project_id, MAX(sum_sov_total) AS bid
        FROM estimates
        WHERE sum_sov_total > 0
        GROUP BY project_id
    """).fetchall()
    conn.close()
    for r in rows:
        bids[r[0]] = r[1]
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
    job_revenue = defaultdict(float)     # invoices
    job_collected = defaultdict(float)   # payments received
    job_credits = defaultdict(float)     # vendor credits (reduce cost)
    job_labor_hours = defaultdict(float) # time activities
    job_cost_txns = defaultdict(int)
    job_rev_txns = defaultdict(int)
    job_has_labor = defaultdict(bool)

    untagged_cost = 0
    untagged_rev = 0

    # Process bills (cost side)
    for bill in bills:
        amounts = line_amounts_by_customer(bill)
        if not amounts:
            untagged_cost += float(bill.get("TotalAmt", 0))
            continue
        for cid, amt in amounts.items():
            job_costs[cid] += amt
            job_cost_txns[cid] += 1

    # Process vendor credits (reduce cost)
    for vc in vendor_credits:
        amounts = line_amounts_by_customer(vc)
        for cid, amt in amounts.items():
            job_credits[cid] += amt

    # Process invoices (revenue side)
    for inv in invoices:
        amounts = line_amounts_by_customer(inv)
        if not amounts:
            untagged_rev += float(inv.get("TotalAmt", 0))
            continue
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
        labor_hrs = job_labor_hours.get(cid, 0)
        has_labor = job_has_labor.get(cid, False)

        gross_margin = revenue - cost
        gross_pct = (gross_margin / revenue * 100) if revenue > 0 else 0

        # Bid comparison (if mapped to a brain project)
        bid = bids.get(project_id) if project_id else None
        bid_vs_actual = None
        if bid and bid > 0:
            bid_vs_actual = {
                "bid": bid,
                "actual_cost": cost,
                "actual_revenue": revenue,
                "cost_variance": cost - (bid * 0.862),  # rough: bid is SOV, cost ≈ bid / (1 + markup)
                "margin_bid": 13.7,  # the system-wide average from ANALYSIS.md
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

    return results, untagged_cost, untagged_rev


def main():
    losses_only = "--losses" in sys.argv
    single_job = None
    if "--job" in sys.argv:
        idx = sys.argv.index("--job")
        if idx + 1 < len(sys.argv):
            single_job = sys.argv[idx + 1].lower()

    results, untagged_cost, untagged_rev = compute_pnl()

    # Save full results
    out = DATA_DIR / "qb_pnl.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"\n  P&L for {len(results)} jobs saved to {out}")

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
    print(f"  Untagged cost:    ${untagged_cost:>12,.0f}  (overhead or mis-tagged)")
    print(f"  Untagged revenue: ${untagged_rev:>12,.0f}")
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
            print(f"    Bid: ${bc['bid']:,.0f} | Actual cost: ${bc['actual_cost']:,.0f} | "
                  f"Bid margin: {bc['margin_bid']:.1f}% | Actual margin: {bc['margin_actual']:.1f}%")

        if single_job:
            print(f"    Labor hours: {r['labor_hours']}")
            print(f"    Cost txns: {r['cost_txns']} | Revenue txns: {r['rev_txns']}")
            print(f"    Collected: ${r['collected']:,.0f}")
            print(f"    Match: {r['project_id']} ({r['match_confidence']})")

    print()


if __name__ == "__main__":
    main()
