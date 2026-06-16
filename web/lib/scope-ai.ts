// ConstructionAI scope seam — the documented plug-in point for James's own fine-tuned estimator
// (parse_job.py: "replace parse_job_text with a call to the model ... same return shape").
// It produces the SCOPE (line descriptions + quantities); MHP's catalog still prices every line
// via buildLines, so the p25/p75 bands Bid Guard relies on are unchanged.
//
// FLAG-GATED: returns null when CONSTRUCTIONAI_MODEL_URL is unset or on any error, so the
// deterministic regex parser (parseJobText) remains the fallback and nothing regresses.

export interface AiScope {
  descriptions: string[];
  qtyByCanon?: Map<string, number>;
}

// CSV row contract from constructionai/api/service.py: division|description|quantity|unit|unit_cost|total
// Exported for unit testing (the public aiScope wraps it behind a fetch).
export function parseCsv(text: string): AiScope {
  const descriptions: string[] = [];
  const qtyByCanon = new Map<string, number>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("division|") || line.startsWith("#")) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 2) continue;
    const desc = cols[1];
    if (!desc) continue;
    descriptions.push(desc);
    const qty = Number(cols[2]);
    if (Number.isFinite(qty) && qty > 0) qtyByCanon.set(desc.toLowerCase().replace(/\s+/g, " ").trim(), qty);
  }
  return { descriptions, qtyByCanon: qtyByCanon.size ? qtyByCanon : undefined };
}

export async function aiScope(text: string): Promise<AiScope | null> {
  const url = process.env.CONSTRUCTIONAI_MODEL_URL;
  if (!url || !text.trim()) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.CONSTRUCTIONAI_API_KEY) headers["Authorization"] = `Bearer ${process.env.CONSTRUCTIONAI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ project: { description: text } }),
    });
    if (!res.ok) return null;
    // The estimator may return raw CSV text or JSON wrapping it; handle both.
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let csv = raw;
    if (ct.includes("application/json")) {
      const j = JSON.parse(raw);
      csv = String(typeof j === "string" ? j : (j.csv ?? j.result ?? j.output ?? j.text ?? ""));
    }
    const out = parseCsv(csv);
    return out.descriptions.length ? out : null;
  } catch {
    return null;
  }
}
