// Standalone test for photo-to-scope — mirrors lib/vision.ts exactly, but runs outside Next
// (no login/dev-server needed). Reads ANTHROPIC_API_KEY + CLAUDE_VISION_MODEL from web/.env.local.
//
//   node scripts/test-vision.mjs /path/to/jobsite-photo.jpg [more.jpg ...]
//
// Prints the extracted scope of work + token usage. Costs one vision API call.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// minimal .env.local loader (no dep) — only the two keys we need
function loadEnv() {
  try {
    const txt = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local */ }
}
loadEnv();

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const PROMPT =
  "These are photos from a residential construction job site. Describe the scope of work visible " +
  "in plain prose for an estimator — rooms and their condition, visible dimensions, materials and " +
  "finishes, and any damage or existing conditions. State only what you can see. No preamble, no headings.";

const paths = process.argv.slice(2);
if (!paths.length) { console.error("Usage: node scripts/test-vision.mjs <image> [image...]"); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not found in web/.env.local — add it first."); process.exit(1); }

const model = process.env.CLAUDE_VISION_MODEL ?? "claude-opus-4-8";
const images = paths.map((p) => {
  const ext = extname(p).toLowerCase();
  const media_type = MIME[ext];
  if (!media_type) { console.error(`Unsupported image type: ${p}`); process.exit(1); }
  return { type: "image", source: { type: "base64", media_type, data: readFileSync(p).toString("base64") } };
});

console.log(`Model: ${model}  ·  Images: ${paths.length}\n`);
const client = new Anthropic();
const res = await client.messages.create({
  model,
  max_tokens: 1024,
  messages: [{ role: "user", content: [...images, { type: "text", text: PROMPT }] }],
});

console.log("--- SCOPE ---");
console.log(res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim());
console.log("\n--- usage ---");
console.log(`stop_reason: ${res.stop_reason}  ·  in: ${res.usage.input_tokens}  ·  out: ${res.usage.output_tokens}`);
