#!/usr/bin/env python3
"""
backup.py — Protect the moat. Versioned, integrity-checked, off-disk snapshots
of the MHP brain.

The entire 149-job pricing brain is one SQLite file (`mhp.db`). One dead disk and
the asset no competitor can replicate is gone. This snapshots the db + the CSV/xlsx
exports to a cloud-synced folder (iCloud Drive — off this disk automatically),
names each by timestamp, verifies the copy actually opens as valid SQLite before
trusting it, and prunes on a daily/weekly retention so the folder doesn't grow
without bound.

Destination: ~/Library/Mobile Documents/com~apple~CloudDocs/MHP-Brain-Backups/
Retention:   keep every backup from the last 14 days (daily), plus one per week
             for the last 8 weeks. Everything older is pruned.

Run by hand any time, or daily via the `com.mhp.backup` launchd job.

Usage:
    python3 backup.py            # snapshot + verify + prune
    python3 backup.py --list     # show what's in the backup store
    python3 backup.py --verify <path>   # integrity-check one backup's db
"""
import argparse
import shutil
import sqlite3
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = HERE / "mhp.db"
EXPORT = HERE / "export"
DEST = (Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
        / "MHP-Brain-Backups")
KEEP_DAILY_DAYS = 14
KEEP_WEEKLY_WEEKS = 8
STAMP_FMT = "%Y%m%d-%H%M%S"


def db_ok(path: Path) -> bool:
    """A backup that won't open is not a backup. PRAGMA integrity_check is the
    truth — a byte copy can still be torn if the db was mid-write."""
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            row = con.execute("PRAGMA integrity_check").fetchone()
            n = con.execute("SELECT COUNT(*) FROM line_items").fetchone()[0]
        finally:
            con.close()
        return row and row[0] == "ok" and n > 0
    except sqlite3.Error:
        return False


def make_backup() -> Path:
    if not DB.exists():
        raise SystemExit(f"no database to back up: {DB}")
    if not db_ok(DB):
        raise SystemExit(f"LIVE db failed integrity check — refusing to snapshot a corrupt source: {DB}")
    DEST.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime(STAMP_FMT)
    out = DEST / f"mhp-brain-{stamp}.zip"

    # Snapshot the db via SQLite's backup API (consistent even if something is
    # mid-write), then bundle it + the exports into one timestamped zip.
    tmp_db = DEST / f".mhp-{stamp}.db"
    src = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    dst = sqlite3.connect(str(tmp_db))
    with dst:
        src.backup(dst)
    src.close()
    dst.close()

    if not db_ok(tmp_db):
        tmp_db.unlink(missing_ok=True)
        raise SystemExit("snapshot failed its own integrity check — backup aborted, nothing pruned")

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(tmp_db, "mhp.db")
        if EXPORT.exists():
            for f in EXPORT.rglob("*"):
                if f.is_file():
                    z.write(f, f.relative_to(HERE))
    tmp_db.unlink(missing_ok=True)
    return out


def stamp_of(p: Path):
    try:
        return datetime.strptime(p.stem.replace("mhp-brain-", ""), STAMP_FMT)
    except ValueError:
        return None


def prune():
    """Keep all backups < 14 days old; for older ones keep one per ISO-week for 8
    weeks; drop the rest. Never touches anything we can't parse a date from."""
    backups = sorted((p for p in DEST.glob("mhp-brain-*.zip") if stamp_of(p)),
                     key=stamp_of, reverse=True)
    now = datetime.now()
    keep, seen_weeks = set(), set()
    for p in backups:
        age = now - stamp_of(p)
        if age <= timedelta(days=KEEP_DAILY_DAYS):
            keep.add(p)
        elif age <= timedelta(weeks=KEEP_WEEKLY_WEEKS):
            wk = stamp_of(p).isocalendar()[:2]      # (year, week)
            if wk not in seen_weeks:
                seen_weeks.add(wk)
                keep.add(p)
    pruned = [p for p in backups if p not in keep]
    for p in pruned:
        p.unlink()
    return len(keep), pruned


def human_size(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f}{u}"
        n /= 1024
    return f"{n:.0f}TB"


def cmd_list():
    if not DEST.exists():
        print(f"no backup store yet at {DEST}")
        return
    backups = sorted((p for p in DEST.glob("mhp-brain-*.zip")), key=lambda p: p.name, reverse=True)
    print(f"{len(backups)} backups in {DEST}")
    for p in backups[:20]:
        print(f"  {p.name}  {human_size(p.stat().st_size)}")
    if len(backups) > 20:
        print(f"  … and {len(backups) - 20} more")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="show the backup store")
    ap.add_argument("--verify", metavar="ZIP", help="integrity-check one backup's db")
    args = ap.parse_args()

    if args.list:
        cmd_list()
        return
    if args.verify:
        z = Path(args.verify)
        tmp = DEST / ".verify.db"
        with zipfile.ZipFile(z) as zf, open(tmp, "wb") as f:
            f.write(zf.read("mhp.db"))
        ok = db_ok(tmp)
        tmp.unlink(missing_ok=True)
        print(f"{'OK' if ok else 'CORRUPT'}: {z}")
        sys.exit(0 if ok else 1)

    out = make_backup()
    kept, pruned = prune()
    print(f"backed up -> {out} ({human_size(out.stat().st_size)})")
    print(f"  store: {kept} kept · {len(pruned)} pruned")


if __name__ == "__main__":
    main()
