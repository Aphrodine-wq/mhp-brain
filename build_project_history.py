"""Build PROJECT_HISTORY.md — every MHP project, with the signals needed to verify
which jobs were actually built vs bid-only vs dead leads.

James verifies by editing the checkboxes in the output:
    - [x]  ...                  we DID this job (built it)
    - [ ]  ...                  not verified yet
    - [x]  ... — DIDN'T         we did NOT do this (dead lead / duplicate / not ours)

The marks are machine-readable, so a later pass folds them back into the DB as the
verified ground truth. Re-running this script preserves nothing — it regenerates from
data — so verify in a copy or we wire read-back before the next regen.

Sources: Project_Index.csv (the company's own index) + mhp.db (parsed estimates + actuals).
Run:  python3 build_project_history.py
"""
import csv
import re
import sqlite3
from pathlib import Path

CSV = Path.home() / "Desktop/Walt/Clients/MHP Construction (Josh)/Project_Index.csv"
DB = Path(__file__).parent / "mhp.db"
OUT = Path(__file__).parent / "PROJECT_HISTORY.md"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]


def money(s):
    """Parse '$214,863' -> 214863, else None."""
    if not s:
        return None
    m = re.sub(r"[^\d.]", "", s)
    return int(float(m)) if m else None


def year_of(earliest, latest):
    yrs = [int(y) for d in (latest, earliest) for y in re.findall(r"20\d\d", d or "")]
    return max(yrs) if yrs else None


def signal(status, file_count, n_est, has_actual):
    """Best-guess one-word tag to speed verification. James confirms/corrects."""
    s = (status or "").lower()
    if has_actual:
        return "BUILT"          # we have a closeout — almost certainly built
    if s in ("active", "aging", "paused", "likely done", "done"):
        return "BUILT?"         # in-progress/closing status
    if s == "bid":
        return "BID"            # bid, outcome unknown
    if n_est and n_est > 0:
        return "BID" if file_count < 60 else "BUILT?"
    if file_count and file_count < 30:
        return "LEAD?"          # thin folder, no estimate — likely an inquiry
    return "DEAD-LEAD"


def main():
    con = sqlite3.connect(DB)
    # per-project DB facts
    est = {pid: (n, v) for pid, n, v in con.execute(
        "SELECT project_id, COUNT(*), MAX(sum_sov_total) FROM estimates "
        "WHERE parse_confidence!='FAILED' GROUP BY project_id")}
    act = {pid: v for pid, v in con.execute(
        "SELECT project_id, MAX(closing_total) FROM actuals "
        "WHERE closing_total IS NOT NULL GROUP BY project_id")}
    db_status = {pid: st for pid, st in con.execute("SELECT id, status FROM projects")}

    rows = list(csv.DictReader(open(CSV)))
    enriched = []
    for r in rows:
        pid = slug(r["project"])
        n_est = est.get(pid, (0, None))[0]
        actual = act.get(pid)
        fc = int(r["file_count"]) if (r["file_count"] or "").isdigit() else 0
        status = db_status.get(pid) or r["status"]
        enriched.append({
            "name": r["project"], "client": r["client"], "type": r["type"],
            "earliest": r["earliest_date"], "latest": r["latest_date"],
            "months": r["length_months"], "files": fc, "n_est": n_est,
            "value": money(r["estimated_value"]), "actual": actual, "status": status,
            "address": r["client_address"],
            "year": year_of(r["earliest_date"], r["latest_date"]),
            "sig": signal(status, fc, n_est, actual is not None),
        })

    # group by year, newest first; unknown year last
    years = sorted({e["year"] for e in enriched if e["year"]}, reverse=True)
    out = ["# MHP Project History", "",
           "Every project on record. **Verify by editing the checkbox:**", "",
           "- `[x]` — we built this job",
           "- `[ ]` — not verified yet",
           "- `[x] ... — DIDN'T` — confirmed we did NOT do this (dead lead / duplicate / not ours)",
           "",
           "`signal` is my guess to speed you up — confirm or correct it. "
           "`files`/`est` = folder size + parsed estimate versions (real jobs leave more behind). "
           "`actual` = a closeout exists in the data.", "",
           f"**{len(enriched)} projects** · "
           f"{sum(1 for e in enriched if e['actual'])} with a captured actual · "
           f"{sum(1 for e in enriched if e['n_est'])} with a parsed bid.", ""]

    def fmt(e):
        val = f"${e['value']:,}" if e["value"] else "$—"
        act = f" · actual ${e['actual']:,.0f}" if e["actual"] else ""
        span = e["latest"] if e["earliest"] == e["latest"] else f"{e['earliest']}→{e['latest']}"
        addr = f" · {e['address'][:28]}" if e["address"] else ""
        return (f"- [ ] **{e['name']}** — {e['type'][:40]}{addr} · {span} · "
                f"{e['files']}f · {e['n_est']}est · {val}{act} · "
                f"status:{e['status']} · **signal:{e['sig']}**")

    for y in years:
        grp = sorted([e for e in enriched if e["year"] == y],
                     key=lambda e: (e["value"] or 0), reverse=True)
        out.append(f"\n## {y}  ({len(grp)} projects)\n")
        out += [fmt(e) for e in grp]

    undated = [e for e in enriched if not e["year"]]
    if undated:
        out.append(f"\n## Undated  ({len(undated)} projects)\n")
        out += [fmt(e) for e in sorted(undated, key=lambda e: (e["value"] or 0), reverse=True)]

    OUT.write_text("\n".join(out) + "\n")
    con.close()
    print(f"Wrote {OUT.name} — {len(enriched)} projects across {len(years)} years "
          f"({years[-1]}–{years[0]}).")
    # quick year breakdown to stdout
    for y in years:
        g = [e for e in enriched if e["year"] == y]
        print(f"  {y}: {len(g):>3} projects · {sum(1 for e in g if e['actual'])} actuals · "
              f"{sum(1 for e in g if e['n_est'])} bid")


if __name__ == "__main__":
    main()
