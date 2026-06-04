// Faithful ports of normalize.py: canon() and norm_unit(). These MUST match the pipeline's
// canonicalization exactly, since catalog lookups + override keys depend on them.

export function canon(desc: string | null | undefined): string {
  return String(desc ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const UNIT_ALIASES: Record<string, string[]> = {
  sqft: ["sqft", "sq ft", "sf", "square foot", "square feet"],
  lft: ["lft", "lf", "lnft", "linear foot", "linear feet", "ln ft"],
  each: ["each", "ea", "ea."],
  cy: ["cy", "yard", "yards", "cubic yard"],
  square: ["square", "per square", "sq"],
  thousand: ["per thousand", "thousand"],
};

export function normUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  let s = String(u).replace(/\s+/g, " ").trim().toLowerCase().replace(/\.+$/, "");
  for (const [canonName, aliases] of Object.entries(UNIT_ALIASES)) {
    if (aliases.includes(s)) return canonName;
  }
  s = s.replace(/^per\s+/, ""); // "per door" -> "door"
  return s || null;
}
