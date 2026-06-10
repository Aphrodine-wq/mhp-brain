// Shared project-name matcher — links external things (OneDrive files, Trello cards,
// calendar events) to brain projects by distinctive whole-word name tokens. Generic
// construction words are stopped so "Kingery" beats "renovation".

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set([
  "project", "projects", "house", "home", "build", "building", "master", "file", "docs", "construction",
  "porch", "room", "remodel", "renovation", "repair", "improvement", "addition", "garage", "kitchen",
  "bathroom", "deck", "wall", "retaining", "bonus", "custom", "guest", "the", "and", "mhp", "prime",
  "complete", "with", "docusign", "contract", "permit", "plan", "sign", "active", "dead",
]);

export interface ProjectRef {
  id: string;
  name: string;
}

/** Best project for a haystack string, or null. Requires ≥1 distinctive token hit and
 *  ≥50% of the project's distinctive tokens present; more hits beat a higher ratio. */
export function matchProject(projects: ProjectRef[], haystack: string): ProjectRef | null {
  const hayTokens = new Set(norm(haystack).split(" "));
  let best: { p: ProjectRef; hits: number; score: number } | null = null;
  for (const p of projects) {
    const tokens = norm(p.name).split(" ").filter((t) => t.length > 3 && !STOP.has(t));
    if (!tokens.length) continue;
    const hits = tokens.filter((t) => hayTokens.has(t)).length;
    const score = hits / tokens.length;
    if (hits >= 1 && score >= 0.5 && (!best || hits > best.hits || (hits === best.hits && score > best.score))) {
      best = { p, hits, score };
    }
  }
  return best?.p ?? null;
}
