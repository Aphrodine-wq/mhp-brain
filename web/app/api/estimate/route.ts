import { requireUser } from "@/lib/auth";
import { parseJobText } from "@/lib/parse-job";
import { buildLines } from "@/lib/pricing";
import { expandAssembly, ASSEMBLIES } from "@/lib/assemblies";

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

  // Free-text path (unchanged).
  let text: string = data.description ?? "";
  for (const doc of data.docs ?? []) {
    if (doc?.text) text += "\n" + doc.text;
  }
  const { descriptions, detected, notes } = parseJobText(text);
  const lines = await buildLines(descriptions, detected);
  return Response.json({ lines, notes, markup: Math.round((DEFAULT_MARKUP - 1) * 100) });
}
