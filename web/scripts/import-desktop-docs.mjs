// One-shot import of MHP paperwork from the Desktop archive into the documents table.
// Sources (under ~/Desktop/Walt/Clients/MHP Construction (Josh)):
//   - 03_Company Documents/All Active Client Contracts  -> Contract
//   - 03_Company Documents/Custom Home Building Plans   -> Plan
//   - any file named *permit* across project folders    -> Permit
// Links each doc to a project when the path clearly names one; otherwise keeps the
// source folder as the label. Idempotent: skips files already imported (same
// filename + category). Run: node scripts/import-desktop-docs.mjs [--dry-run]
import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname } from "path";
import { randomUUID } from "crypto";
import pg from "pg";

const DRY = process.argv.includes("--dry-run");
const ROOT = `${process.env.HOME}/Desktop/Walt/Clients/MHP Construction (Josh)`;
const MAX_BYTES = 15 * 1024 * 1024;
const EXT_OK = new Set([".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".xlsx", ".heic"]);
const MIME = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic",
};

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^"|"$/g, "");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set([
  "project", "projects", "house", "home", "build", "building", "master", "file", "docs", "construction",
  "porch", "room", "remodel", "renovation", "repair", "improvement", "addition", "garage", "kitchen",
  "bathroom", "deck", "wall", "retaining", "bonus", "custom", "guest", "the", "and", "mhp", "prime",
  "complete", "with", "docusign", "contract", "permit", "plan", "sign", "active", "dead",
]);

// match a file to a project by distinctive (whole-word) name tokens shared with the path
function matchProject(projects, relPath) {
  const hayTokens = new Set(norm(relPath).split(" "));
  let best = null;
  for (const p of projects) {
    const tokens = norm(p.name).split(" ").filter((t) => t.length > 3 && !STOP.has(t));
    if (!tokens.length) continue;
    const hits = tokens.filter((t) => hayTokens.has(t)).length;
    const score = hits / tokens.length;
    if (hits >= 1 && score >= 0.5 && (!best || hits > best.hits || (hits === best.hits && score > best.score))) {
      best = { id: p.id, name: p.name, hits, score };
    }
  }
  return best;
}

const sources = [
  { dir: join(ROOT, "03_Company Documents/All Active Client Contracts"), category: "Contract", all: true },
  { dir: join(ROOT, "03_Company Documents/Custom Home Building Plans"), category: "Plan", all: true },
  { dir: ROOT, category: "Permit", all: false, nameRe: /permit/i },
];

const projects = (await pool.query("SELECT id, name FROM projects")).rows;
const existing = new Set(
  (await pool.query("SELECT filename, category FROM documents").catch(() => ({ rows: [] }))).rows
    .map((r) => `${r.category}|${r.filename}`),
);

let imported = 0, skippedDup = 0, skippedBig = 0, skippedExt = 0;
for (const src of sources) {
  for (const file of walk(src.dir)) {
    const name = basename(file);
    if (!src.all && !src.nameRe.test(name)) continue;
    // the permit sweep walks the whole root — don't re-import the dedicated dirs
    if (!src.all && file.includes("03_Company Documents/All Active Client Contracts")) continue;
    const ext = extname(name).toLowerCase();
    if (!EXT_OK.has(ext)) { skippedExt++; continue; }
    const size = statSync(file).size;
    if (size > MAX_BYTES) { console.log(`SKIP >15MB: ${name}`); skippedBig++; continue; }
    if (existing.has(`${src.category}|${name}`)) { skippedDup++; continue; }

    const rel = file.slice(ROOT.length + 1);
    const m = matchProject(projects, rel);
    const folder = basename(join(file, ".."));
    const label = m?.name ?? (folder.startsWith("03_") ? null : folder);
    console.log(`${DRY ? "[dry] " : ""}${src.category}: ${name}  ->  ${m ? `project: ${m.name}` : label ?? "general"}`);
    if (DRY) { imported++; continue; }
    await pool.query(
      `INSERT INTO documents (id, category, entity_type, entity_id, entity_label, filename, mime, size_bytes, content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [randomUUID(), src.category, m ? "project" : null, m?.id ?? null, label, name, MIME[ext] ?? null, size, readFileSync(file), "Import — Desktop archive"],
    );
    existing.add(`${src.category}|${name}`);
    imported++;
  }
}
console.log(`\nimported ${imported} · dup-skipped ${skippedDup} · oversize ${skippedBig} · non-doc ${skippedExt}`);
await pool.end();
