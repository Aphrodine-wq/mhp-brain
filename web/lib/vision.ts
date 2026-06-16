import Anthropic from "@anthropic-ai/sdk";

// Photo-to-scope — turns uploaded site photos into a plain-prose scope of work that feeds the
// existing estimate pipeline (aiScope / parseJobText). This is the one capability MHP doesn't
// own a model for; it never replaces the ConstructionAI estimator, it feeds it.
//
// FLAG-GATED: returns "" when ANTHROPIC_API_KEY is unset or on any error, so uploads are simply
// ignored (today's behavior) and the build never breaks.

export interface VisionImage {
  mime: string;
  data: string; // base64, no data: prefix
}

const PROMPT =
  "These are photos from a residential construction job site. Describe the scope of work visible " +
  "in plain prose for an estimator — rooms and their condition, visible dimensions, materials and " +
  "finishes, and any damage or existing conditions. State only what you can see. No preamble, no headings.";

export async function photosToScope(images: VisionImage[]): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY || !images.length) return "";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.CLAUDE_VISION_MODEL ?? "claude-opus-4-8",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            ...images.slice(0, 8).map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mime as "image/png" | "image/jpeg" | "image/webp", data: img.data },
            })),
            { type: "text" as const, text: PROMPT },
          ],
        },
      ],
    });
    return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  } catch {
    return "";
  }
}
