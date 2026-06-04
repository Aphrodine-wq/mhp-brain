"""Select the kitchen estimate corpus from the organized MHP data.

A kitchen project's *prime* MHP estimate is an .xlsx with "estimate" in the name
that is NOT a subcontractor estimate (DSC...), allowance/selection sheet, or a
material-only quote. We also surface any closing-budget files for the variance check.
"""
import csv
import hashlib
import re
from pathlib import Path

MHP = Path.home() / "Desktop/Walt/Clients/MHP Construction (Josh)"
INDEX = MHP / "Project_Index.csv"
PROJECT_DIRS = [MHP / "01_Active Projects", MHP / "02_Dead Projects"]

# Files that look like estimates but are NOT MHP's prime estimate
EXCLUDE = re.compile(r"\b(dsc|allowance|selection|invoice|change order|sub\b)", re.I)
ESTIMATE_HINT = re.compile(r"estimat", re.I)   # matches estimate / estimation / estimating
CLOSING_HINT = re.compile(r"clos(e|ing)|close ?out|final budget", re.I)


def slug(s: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    if len(base) <= 80:
        return base
    # Distinguishing tokens (e.g. ' RV1', ' RDB Working Doc') often sit past char 80.
    # A bare [:80] truncation collided two file revisions into one id and merged their
    # line items. Keep it readable but append a stable hash so distinct files never collide.
    return base[:73] + "-" + hashlib.md5(s.encode()).hexdigest()[:6]


def projects(kitchen_only=False):
    """Yield dict rows from Project_Index.csv (optionally kitchen-only)."""
    with open(INDEX) as f:
        for r in csv.DictReader(f):
            if kitchen_only and "kitchen" not in (r["type"] + " " + r["project"]).lower():
                continue
            yield r


def kitchen_projects():
    return projects(kitchen_only=True)


def find_project_dir(project_name: str) -> Path | None:
    target = project_name.strip()
    for base in PROJECT_DIRS:
        cand = base / target
        if cand.is_dir():
            return cand
    # fuzzy: first dir whose name shares the leading token
    head = target.split(" - ")[0].split(" _ ")[0].strip().lower()
    for base in PROJECT_DIRS:
        if not base.is_dir():
            continue
        for d in base.iterdir():
            if d.is_dir() and d.name.lower().startswith(head[:12]):
                return d
    return None


def find_estimate_files(project_dir: Path):
    prime, closings = [], []
    for p in project_dir.rglob("*.xlsx"):
        name = p.name
        if name.startswith("~$"):
            continue
        if CLOSING_HINT.search(name):
            closings.append(p)
        if ESTIMATE_HINT.search(name) and not EXCLUDE.search(name):
            prime.append(p)
    return prime, closings


def build_corpus(kitchen_only=False):
    corpus = []
    for r in projects(kitchen_only=kitchen_only):
        pdir = find_project_dir(r["project"])
        if not pdir:
            corpus.append({"project": r, "dir": None, "estimates": [], "closings": []})
            continue
        prime, closings = find_estimate_files(pdir)
        corpus.append({"project": r, "dir": pdir, "estimates": prime, "closings": closings})
    return corpus


if __name__ == "__main__":
    c = build_corpus()
    total_est = sum(len(x["estimates"]) for x in c)
    print(f"{len(c)} kitchen projects | {total_est} prime estimate files | "
          f"{sum(len(x['closings']) for x in c)} closing files\n")
    for x in c:
        p = x["project"]
        loc = "NO DIR" if not x["dir"] else f"{len(x['estimates'])} est, {len(x['closings'])} close"
        print(f"  [{p['status']:<6}] {p['project'][:44]:<44} {loc}")
        for e in x["estimates"]:
            print(f"        est: {e.relative_to(x['dir'])}")
        for cl in x["closings"]:
            print(f"        close: {cl.relative_to(x['dir'])}")
