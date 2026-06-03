"""Turn a free-text job description into a seed scope (line items + quantities).

This is the deterministic v0. It maps common contractor phrasing to catalog items and pulls
quantities where stated. It only SEEDS the sheet — the estimator edits/fills the rest in the UI.

>>> ConstructionAI plugs in here: replace `parse_job_text` with a call to the model to extract
    a structured scope from prose + uploaded docs. Same return shape, smarter extraction. <<<
"""
import re

# phrase (substring, lowercased) -> list of catalog descriptions to seed
PHRASE_MAP = [
    (r"cabinet", ["Kitchen Cabinets"]),
    (r"counter|quartz|granite|countertop", ["Countertop Material", "Countertop Labor"]),
    (r"backsplash", ["Backsplash Tile Materails", "Backsplash Tile Labor"]),
    (r"\blvt\b|vinyl|luxury vinyl|floor", ["LVT Flooring - Materials", "LVT Flooring - Labor"]),
    (r"paint", ["Interior Paint Material", "Interior Paint Labor"]),
    (r"drywall|sheetrock", ["Drywall "]),
    (r"\btrim\b|baseboard|crown|molding", ["Interior Trim Material", "Interior Trim Labor"]),
    (r"demo|demolition|tear ?out|gut", ["Structure Demolition"]),
    (r"fram", ["Framing Material", "Framing Labor"]),
    (r"electric|wiring|outlet|lighting", ["Electrical Material", "Electrical Labor"]),
    (r"plumb|sink|faucet|fixture", ["Plumbing Material & Labor"]),
    (r"insulat", ["Insulation Material", "Insulation Labor"]),
    (r"door", ["Interior Doors", "Door Hardware"]),
    (r"window", ["Windows "]),
    (r"shelv|closet", ["Closet Shelving Material", "Closet Shelving Labor"]),
]

# items that should be on essentially every job
ALWAYS = ["General Conditions", "Project Coordination (Supervision)"]

SQFT_RE = re.compile(r"(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|square\s*feet|sf)\b", re.I)
LFT_RE = re.compile(r"(\d[\d,]*)\s*(?:lin(?:ear)?\.?\s*f(?:ee|oo)?t|lft|lf)\b", re.I)


def _num(m):
    return float(m.group(1).replace(",", "")) if m else None


def parse_job_text(text):
    """Return (descriptions, detected, notes). qty is assigned later from each line's real unit."""
    t = text.lower()
    detected = {"sqft": _num(SQFT_RE.search(text)), "lft": _num(LFT_RE.search(text))}

    picked, seen = list(ALWAYS), set(ALWAYS)
    for pattern, descs in PHRASE_MAP:
        if re.search(pattern, t):
            for d in descs:
                if d not in seen:
                    seen.add(d)
                    picked.append(d)

    notes = []
    if detected["sqft"]:
        notes.append(f"Detected area: {detected['sqft']:g} sqft (seeded onto area-based lines — verify per line)")
    else:
        notes.append("No area found — fill quantities on area-based lines")
    if detected["lft"]:
        notes.append(f"Detected linear feet: {detected['lft']:g} lft (cabinets/shelving)")
    return picked, detected, notes


SQFT_UNITS = {"sqft", "under roof sqft", "interior", "exterior", "sqft allowance", "sqft feet"}


def qty_for(unit, description, detected):
    """Seed a starting qty from the line's real unit. None = estimator fills."""
    u = (unit or "").strip().lower()
    if description in ALWAYS:
        return 1
    if u == "lft":
        return detected.get("lft")
    if u in SQFT_UNITS:
        return detected.get("sqft")
    return None  # each / opening / lump / blank -> discrete, estimator fills
