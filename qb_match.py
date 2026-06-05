"""
Match QuickBooks Customer:Job entries to mhp-brain projects.

Usage:
  python qb_match.py              — run the matcher, print results + write qb_data/qb_job_map.json
  python qb_match.py --review     — show only ambiguous matches that need human confirmation

Reads:
  qb_data/qb_customers.json   (from qb_export.py pull)
  mhp.db                      (the brain's project database)

Writes:
  qb_data/qb_job_map.json     (the mapping: QB job → brain project, with confidence)
"""

import json
import re
import sqlite3
import sys
from pathlib import Path
from difflib import SequenceMatcher

DATA_DIR = Path(__file__).parent / "qb_data"
DB_PATH = Path(__file__).parent / "mhp.db"


def slug(text):
    """Normalize to a comparable slug (same logic as the brain's extract.py)."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def name_words(text):
    """Extract meaningful name words (4+ chars, lowercase)."""
    return [w.lower() for w in re.split(r"[\s\-–_.,/&]+", text) if len(w) >= 4]


def similarity(a, b):
    """String similarity ratio (0-1)."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def match_job_to_project(qb_name, qb_address, projects):
    """
    Try to match a QB Customer:Job to a brain project.
    Returns (project_id, confidence, method) or (None, None, None).

    Confidence tiers:
      exact    — slug match or >0.9 similarity
      high     — strong name overlap + address confirmation
      medium   — partial name match
      low      — weak match, needs human review
    """
    qb_slug = slug(qb_name)
    qb_words = name_words(qb_name)
    qb_addr_slug = slug(qb_address) if qb_address else ""

    best = None
    best_score = 0

    for proj in projects:
        proj_id = proj["id"]
        proj_name = proj["name"]
        proj_slug = slug(proj_name)
        proj_words = name_words(proj_name)

        # Exact slug match
        if qb_slug == proj_slug:
            return proj_id, "exact", "slug_match"

        # High similarity on full name
        sim = similarity(qb_name, proj_name)
        if sim > 0.9:
            return proj_id, "exact", f"similarity_{sim:.2f}"

        # Word overlap — how many QB name words appear in the project name
        if qb_words and proj_words:
            overlap = len(set(qb_words) & set(proj_words))
            # Weight: surname matches are strongest (usually first word)
            surname_match = qb_words[0] in proj_words if qb_words else False

            score = overlap / max(len(qb_words), len(proj_words))
            if surname_match:
                score += 0.3

            # Address confirmation boosts confidence
            if qb_addr_slug and proj.get("address_slug"):
                addr_sim = similarity(qb_addr_slug, proj["address_slug"])
                if addr_sim > 0.6:
                    score += 0.2

            if score > best_score:
                best_score = score
                best = proj_id

    if best and best_score >= 0.7:
        return best, "high", f"word_match_{best_score:.2f}"
    if best and best_score >= 0.4:
        return best, "medium", f"word_match_{best_score:.2f}"
    if best and best_score >= 0.2:
        return best, "low", f"word_match_{best_score:.2f}"

    return None, None, None


def load_projects():
    """Load projects from the brain's SQLite database."""
    if not DB_PATH.exists():
        print(f"WARNING: {DB_PATH} not found. Matching against project names only.")
        return []

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, name, type, market, status FROM projects").fetchall()
    conn.close()

    projects = []
    for r in rows:
        projects.append({
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "market": r["market"],
            "status": r["status"],
            "address_slug": "",  # could be enriched later
        })
    return projects


def load_qb_customers():
    """Load QB customers from the exported JSON."""
    fpath = DATA_DIR / "qb_customers.json"
    if not fpath.exists():
        print(f"ERROR: {fpath} not found. Run: python qb_export.py pull")
        sys.exit(1)
    return json.loads(fpath.read_text())


def run_matcher(review_only=False):
    customers = load_qb_customers()
    projects = load_projects()

    # Separate parent customers from sub-customers (jobs)
    parents = {c["Id"]: c for c in customers if not c.get("Job")}
    jobs = [c for c in customers if c.get("Job")]

    print(f"\n  QB Customers: {len(parents)} clients, {len(jobs)} jobs")
    print(f"  Brain projects: {len(projects)}")
    print()

    results = []
    counts = {"exact": 0, "high": 0, "medium": 0, "low": 0, "unmatched": 0}

    for job in jobs:
        qb_name = job.get("DisplayName", job.get("FullyQualifiedName", ""))
        # Try to get address from QB
        ship = job.get("ShipAddr", {}) or {}
        bill = job.get("BillAddr", {}) or {}
        addr = ship.get("Line1", "") or bill.get("Line1", "")
        city = ship.get("City", "") or bill.get("City", "")
        qb_address = f"{addr} {city}".strip()

        # Get parent customer name
        parent_ref = job.get("ParentRef", {})
        parent_id = parent_ref.get("value") if parent_ref else None
        parent = parents.get(parent_id, {})
        parent_name = parent.get("DisplayName", "")

        # Match
        proj_id, conf, method = match_job_to_project(qb_name, qb_address, projects)

        # If job name didn't match, try parent name
        if not proj_id and parent_name:
            proj_id, conf, method = match_job_to_project(parent_name, qb_address, projects)
            if method:
                method = f"parent:{method}"

        entry = {
            "qb_id": job["Id"],
            "qb_name": qb_name,
            "qb_parent": parent_name,
            "qb_address": qb_address,
            "qb_active": job.get("Active", False),
            "project_id": proj_id,
            "confidence": conf,
            "method": method,
            "confirmed": False,  # human must confirm
        }
        results.append(entry)
        counts[conf or "unmatched"] += 1

    # Sort: unmatched first, then low, medium, high, exact
    tier_order = {"unmatched": 0, "low": 1, "medium": 2, "high": 3, "exact": 4}
    results.sort(key=lambda r: (tier_order.get(r["confidence"] or "unmatched", 0), r["qb_name"]))

    # Print
    if review_only:
        review = [r for r in results if r["confidence"] in (None, "low", "medium")]
        print(f"  === {len(review)} matches need human review ===\n")
        for r in review:
            print(f"  QB: {r['qb_name']}")
            if r["qb_parent"]:
                print(f"      parent: {r['qb_parent']}")
            if r["qb_address"]:
                print(f"      addr:   {r['qb_address']}")
            if r["project_id"]:
                print(f"      -> {r['project_id']} ({r['confidence']}, {r['method']})")
            else:
                print(f"      -> NO MATCH")
            print()
    else:
        print(f"  Match results:")
        print(f"    exact:     {counts['exact']}")
        print(f"    high:      {counts['high']}")
        print(f"    medium:    {counts['medium']} (review recommended)")
        print(f"    low:       {counts['low']} (review required)")
        print(f"    unmatched: {counts['unmatched']}")
        print()

        # Show a sample
        for tier in ["exact", "high"]:
            tier_results = [r for r in results if r["confidence"] == tier][:5]
            if tier_results:
                print(f"  Sample {tier} matches:")
                for r in tier_results:
                    print(f"    {r['qb_name']:<45} -> {r['project_id']}")
                print()

    # Save
    out = DATA_DIR / "qb_job_map.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"  Full mapping saved to {out}")
    print(f"  Edit 'confirmed' to true on each row after human review.")


def main():
    review = "--review" in sys.argv
    run_matcher(review_only=review)


if __name__ == "__main__":
    main()
