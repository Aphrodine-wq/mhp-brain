import { requireUser } from "@/lib/auth";
import { parseJobText } from "@/lib/parse-job";
import { buildLines } from "@/lib/pricing";
import { expandAssembly, ASSEMBLIES } from "@/lib/assemblies";
import { aiScope } from "@/lib/scope-ai";
import { photosToScope, type VisionImage } from "@/lib/vision";

const DEFAULT_MARKUP = 1.18; // matches estimate.DEFAULT_MARKUP

export async function POST(req: Request) {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await req.json();

  // Assembly path: a job-type pick + a few dimensions -> full, correctly-quantified scope.
  if (data.assembly) {
    const expanded = expandAssembly(data.assembly, data.inputs ?? {});
    if (!expanded) return Response.json({ error: "unknown assembly" }, { status: 400 });
    const lines = await buildLines(expanded.descriptions, { sqft: null, lft: null }, expanded.qtyByCanon);
    const label = ASSEMBLIES[data.assembly].label;
    const missing = lines.filter((l) => l.kind === "missing").map((l) => l.description);
    const notes = [
      `${label}: ${lines.length} lines seeded from history-derived quantities — adjust any line.`,
      ...(missing.length ? [`No catalog rate for: ${missing.join(", ")} — fill manually.`] : []),
    ];
    return Response.json({ lines, notes, markup: Math.round((DEFAULT_MARKUP - 1) * 100) });
  }

  // Free-text path. Builds the scope text from the description + any uploaded text docs, then —
  // before parsing — folds in a vision pass on uploaded photos. Both AI steps are flag-gated and
  // fall back cleanly: no vision key → photos ignored; no model URL → deterministic regex parser.
  let text: string = data.description ?? "";
  for (const doc of data.docs ?? []) {
    if (doc?.text) text += "\n" + doc.text;
  }
  const images: VisionImage[] = (data.docs ?? [])
    .filter((d: { mime?: string; data?: string }) => d?.mime && d?.data)
    .map((d: { mime: string; data: string }) => ({ mime: d.mime, data: d.data }));
  if (images.length) {
    const seen = await photosToScope(images);
    if (seen) text = [seen, text].filter(Boolean).join("\n");
  }

  // ConstructionAI for scope when wired; deterministic parser otherwise. Either way buildLines
  // prices against MHP's catalog (keeps the p25/p75 bands Bid Guard depends on).
  const ai = await aiScope(text);
  let lines, notes: string[];
  if (ai) {
    lines = await buildLines(ai.descriptions, { sqft: null, lft: null }, ai.qtyByCanon);
    const missing = lines.filter((l) => l.kind === "missing").map((l) => l.description);
    notes = [
      `Scope from ConstructionAI: ${lines.length} lines, priced against MHP history — adjust any line.`,
      ...(missing.length ? [`No catalog rate for: ${missing.join(", ")} — fill manually.`] : []),
    ];
  } else {
    const parsed = parseJobText(text);
    lines = await buildLines(parsed.descriptions, parsed.detected);
    notes = parsed.notes;
  }
  return Response.json({ lines, notes, markup: Math.round((DEFAULT_MARKUP - 1) * 100) });
}
