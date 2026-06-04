"""Dedup logic — pick ONE canonical estimate per project so downstream counts are real work.

The data keeps every revision: 213 estimate files across 85 projects, the same jobs re-bid up to
12 times. That inflates every line count ~2.35x and, worse, mixes early high bids with final
negotiated ones. This marks the canonical (final, real) estimate per project and exposes two
views so any query can read unique work instead of the duplicate pile.

CANONICAL PICK RULE (deterministic, per project):
  candidates = estimates with >=1 actual line, not flagged DUPLICATE_EXPORT  (FAILED have 0 lines
               so they drop out automatically)
  winner = best by, in order:
     1. parse confidence   CLEAN > FLAGGED
     2. est_date           latest wins; dated beats undated (we have recency signal)
     3. line count         most complete wins (the tiebreak for the 94 undated estimates)
     4. source_file        stable deterministic last resort
  -> the LATEST clean version, which is the bid that actually went out. We deliberately do NOT
     pick "largest," because early bids run high and get cut down — largest would bias high.

This WRITES to mhp.db (additive + reversible): backs the db up first, adds an `is_canonical`
flag column (keeps every revision), and creates `canonical_estimates` / `canonical_line_items`
views. Idempotent — re-run anytime; it recomputes the flags from scratch.

Run:  python3 dedup.py
"""
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
DB = HERE / "mhp.db"
BACKUPS = HERE / ".backups"
OUT = HERE / "DEDUP.md"

CONF_RANK = {"CLEAN": 2, "FLAGGED": 1}


def backup_db():
    BACKUPS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = BACKUPS / f"mhp.db.{stamp}.bak"
    shutil.copy2(DB, dest)
    return dest


def pick_canonical(con):
    """Return {project_id: winning_estimate_id} and the per-project version counts."""
    # Actual line rows per estimate (line_item_count is wrong on a few; trust the real count).
    actual = dict(con.execute(
        "SELECT estimate_id, COUNT(*) FROM line_items GROUP BY estimate_id"))
    ests = con.execute(
        "SELECT id, project_id, parse_confidence, COALESCE(flags,''), COALESCE(est_date,''), "
        "COALESCE(source_file,'') FROM estimates").fetchall()

    by_proj = {}
    versions = {}
    for eid, pid, conf, flags, est_date, src in ests:
        versions[pid] = versions.get(pid, 0) + 1
        n_lines = actual.get(eid, 0)
        if n_lines < 1:
            continue                              # FAILED / empty — never canonical
        if "DUPLICATE_EXPORT" in flags:
            continue                              # known dup export — never canonical
        # sort key: higher is better on every field
        key = (CONF_RANK.get(conf, 0), est_date, n_lines, src)
        cur = by_proj.get(pid)
        if cur is None or key > cur[1]:
            by_proj[pid] = (eid, key)
    winners = {pid: v[0] for pid, v in by_proj.items()}
    return winners, versions


def main():
    backup = backup_db()
    con = sqlite3.connect(DB)

    # --- before ---
    n_proj = con.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
    n_est = con.execute("SELECT COUNT(*) FROM estimates").fetchone()[0]
    n_lines_all = con.execute("SELECT COUNT(*) FROM line_items").fetchone()[0]

    winners, versions = pick_canonical(con)

    # --- schema: additive flag column (idempotent) ---
    have = {r[1] for r in con.execute("PRAGMA table_info(estimates)")}
    if "is_canonical" not in have:
        con.execute("ALTER TABLE estimates ADD COLUMN is_canonical INTEGER DEFAULT 0")
    con.execute("UPDATE estimates SET is_canonical=0")
    con.executemany("UPDATE estimates SET is_canonical=1 WHERE id=?",
                    [(eid,) for eid in winners.values()])

    # --- consumable views ---
    con.executescript("""
        DROP VIEW IF EXISTS canonical_estimates;
        DROP VIEW IF EXISTS canonical_line_items;
        CREATE VIEW canonical_estimates AS
            SELECT * FROM estimates WHERE is_canonical=1;
        CREATE VIEW canonical_line_items AS
            SELECT li.* FROM line_items li
            JOIN estimates e ON li.estimate_id = e.id
            WHERE e.is_canonical = 1;
    """)
    con.commit()

    # --- after ---
    n_canon = con.execute("SELECT COUNT(*) FROM estimates WHERE is_canonical=1").fetchone()[0]
    n_lines_canon = con.execute("SELECT COUNT(*) FROM canonical_line_items").fetchone()[0]
    no_canon = n_est_projects = con.execute("SELECT COUNT(DISTINCT project_id) FROM estimates").fetchone()[0] - n_canon
    inflation_before = n_lines_all / n_lines_canon if n_lines_canon else 0

    # multi-revision picks for the report (sanity check by eye)
    multi = con.execute(
        "SELECT project_id, COUNT(*) FROM estimates GROUP BY project_id HAVING COUNT(*)>2 "
        "ORDER BY COUNT(*) DESC LIMIT 10").fetchall()
    picks = []
    for pid, nver in multi:
        row = con.execute(
            "SELECT id, parse_confidence, est_date, "
            "(SELECT COUNT(*) FROM line_items WHERE estimate_id=estimates.id) lines, sum_sov_total "
            "FROM estimates WHERE project_id=? AND is_canonical=1", (pid,)).fetchone()
        picks.append((pid, nver, row))

    o = ["# MHP Brain — Estimate Dedup", "",
         "*One canonical estimate per project, so counts reflect real work instead of every "
         "revision. The flag is additive — all revisions are kept, the winner is marked.*", "",
         "## Result", "",
         f"- **{n_est} estimate files → {n_canon} canonical** (one per project with a usable bid).",
         f"- **{n_lines_all:,} line items → {n_lines_canon:,} canonical** — the duplicate revisions "
         f"were inflating counts **{inflation_before:.2f}×**.",
         f"- **{no_canon} projects** have no canonical (only failed/empty parses) — they contribute "
         f"zero real work and were silently double-counted before only as noise.", "",
         "## How to use it", "",
         "Any analysis that should count real work reads the views instead of the raw tables:", "",
         "```sql", "SELECT * FROM canonical_line_items;   -- real priced lines, no dupes",
         "SELECT * FROM canonical_estimates;    -- the final bid per project", "```", "",
         "Or filter directly: `... FROM estimates WHERE is_canonical=1`.", "",
         "## Canonical picks — most-revised projects (eyeball check)", "",
         "| Project | Versions | Picked (final) | Conf | Date | Lines | Bid |",
         "|---|--:|---|---|---|--:|--:|"]
    for pid, nver, row in picks:
        if not row:
            o.append(f"| {pid[:30]} | {nver} | *(none usable)* | | | | |")
            continue
        eid, conf, date, lines, sov = row
        o.append(f"| {pid[:30]} | {nver} | {eid[:34]} | {conf} | {date or '—'} | {lines} | "
                 f"${(sov or 0):,.0f} |")
    o += ["", "---", "",
          "## Pick rule", "",
          "Candidates = estimates with ≥1 line and not flagged `DUPLICATE_EXPORT` (FAILED parses "
          "have 0 lines, so they drop out). Winner, in order: **CLEAN > FLAGGED**, then **latest "
          "`est_date`** (dated beats undated), then **most lines**, then source filename. That picks "
          "the *final* bid that went out — not the largest, since early bids run high and get cut.", "",
          "## Safety", "",
          f"- DB backed up to `{backup.relative_to(HERE)}` before any write.",
          "- Only additive changes: one `is_canonical` column + two views. No row deleted, no value "
          "altered. Re-runnable — flags recompute from scratch each run.", "",
          "## Next step (not done here)", "",
          "`normalize.py` still builds the catalog from *all* line items. Point it at "
          "`canonical_line_items` to rebuild `unit_costs`/`lump_costs` on real work only — that's "
          "the change that makes the pricing catalog itself dedup-correct.", "",
          "---",
          f"\n*Wrote `is_canonical` + `canonical_estimates`/`canonical_line_items` views to mhp.db. "
          f"Backup: `{backup.name}`.*"]
    OUT.write_text("\n".join(o) + "\n")

    con.close()
    print(f"Backed up -> {backup.relative_to(HERE)}")
    print(f"Canonical: {n_canon} estimates / {n_est}; lines {n_lines_all:,} -> {n_lines_canon:,} "
          f"({inflation_before:.2f}x dedup)")
    print(f"  {no_canon} projects with no usable bid; views: canonical_estimates, canonical_line_items")
    print(f"Wrote {OUT.name}")


if __name__ == "__main__":
    main()
