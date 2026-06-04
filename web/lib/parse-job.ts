// Faithful port of parse_job.py — deterministic v0 free-text -> seed scope.

const PHRASE_MAP: [RegExp, string[]][] = [
  [/cabinet/, ["Kitchen Cabinets"]],
  [/counter|quartz|granite|countertop/, ["Countertop Material", "Countertop Labor"]],
  [/backsplash/, ["Backsplash Tile Materails", "Backsplash Tile Labor"]],
  [/\blvt\b|vinyl|luxury vinyl|floor/, ["LVT Flooring - Materials", "LVT Flooring - Labor"]],
  [/paint/, ["Interior Paint Material", "Interior Paint Labor"]],
  [/drywall|sheetrock/, ["Drywall "]],
  [/\btrim\b|baseboard|crown|molding/, ["Interior Trim Material", "Interior Trim Labor"]],
  [/demo|demolition|tear ?out|gut/, ["Structure Demolition"]],
  [/fram/, ["Framing Material", "Framing Labor"]],
  [/electric|wiring|outlet|lighting/, ["Electrical Material", "Electrical Labor"]],
  [/plumb|sink|faucet|fixture/, ["Plumbing Material & Labor"]],
  [/insulat/, ["Insulation Material", "Insulation Labor"]],
  [/door/, ["Interior Doors", "Door Hardware"]],
  [/window/, ["Windows "]],
  [/shelv|closet/, ["Closet Shelving Material", "Closet Shelving Labor"]],
];

const ALWAYS = ["General Conditions", "Project Coordination (Supervision)"];

const SQFT_RE = /(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|square\s*feet|sf)\b/i;
const LFT_RE = /(\d[\d,]*)\s*(?:lin(?:ear)?\.?\s*f(?:ee|oo)?t|lft|lf)\b/i;
const SQFT_UNITS = new Set(["sqft", "under roof sqft", "interior", "exterior", "sqft allowance", "sqft feet"]);

export interface Detected {
  sqft: number | null;
  lft: number | null;
}

function numMatch(m: RegExpMatchArray | null): number | null {
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}
const g = (n: number): string => n.toString();

export function parseJobText(text: string): { descriptions: string[]; detected: Detected; notes: string[] } {
  const t = text.toLowerCase();
  const detected: Detected = { sqft: numMatch(text.match(SQFT_RE)), lft: numMatch(text.match(LFT_RE)) };

  const picked = [...ALWAYS];
  const seen = new Set(ALWAYS);
  for (const [pattern, descs] of PHRASE_MAP) {
    if (pattern.test(t)) {
      for (const d of descs) {
        if (!seen.has(d)) {
          seen.add(d);
          picked.push(d);
        }
      }
    }
  }

  const notes: string[] = [];
  if (detected.sqft) notes.push(`Detected area: ${g(detected.sqft)} sqft (seeded onto area-based lines — verify per line)`);
  else notes.push("No area found — fill quantities on area-based lines");
  if (detected.lft) notes.push(`Detected linear feet: ${g(detected.lft)} lft (cabinets/shelving)`);

  return { descriptions: picked, detected, notes };
}

export function qtyFor(unit: string | null, description: string, detected: Detected): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (ALWAYS.includes(description)) return 1;
  if (u === "lft") return detected.lft;
  if (SQFT_UNITS.has(u)) return detected.sqft;
  return null; // each / opening / lump / blank -> estimator fills
}
