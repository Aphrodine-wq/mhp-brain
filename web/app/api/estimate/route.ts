import { parseJobText } from "@/lib/parse-job";
import { buildLines } from "@/lib/pricing";

const DEFAULT_MARKUP = 1.18; // matches estimate.DEFAULT_MARKUP

export async function POST(req: Request) {
  const data = await req.json();
  let text: string = data.description ?? "";
  for (const doc of data.docs ?? []) {
    if (doc?.text) text += "\n" + doc.text;
  }
  const { descriptions, detected, notes } = parseJobText(text);
  const lines = await buildLines(descriptions, detected);
  return Response.json({ lines, notes, markup: Math.round((DEFAULT_MARKUP - 1) * 100) });
}
