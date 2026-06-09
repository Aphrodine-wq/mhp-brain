// Store each estimate's ORIGINAL .xlsx in the app's private Postgres (estimate_files.content BYTEA).
// Never touches public storage; the auth-gated /api/estimates/[id]/document route streams the bytes.
// Run:  cd web && node --env-file=.env.local scripts/store_estimate_files.mjs
import pg from "pg";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename } from "node:path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`CREATE TABLE IF NOT EXISTS estimate_files (
  source_file TEXT PRIMARY KEY,
  filename    TEXT,
  content     BYTEA,
  uploaded_at TIMESTAMPTZ DEFAULT now()
)`);

// Read the canonical file list from the same Postgres the app reads, so source_file values match
// the join in estimatesList / the download route exactly.
const { rows } = await pool.query(`SELECT DISTINCT source_file FROM estimates WHERE source_file IS NOT NULL`);

let stored = 0, skipped = 0, failed = 0;
for (const { source_file } of rows) {
  if (!source_file || !existsSync(source_file)) { skipped++; continue; }
  try {
    const buf = await readFile(source_file);
    await pool.query(
      `INSERT INTO estimate_files (source_file, filename, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_file) DO UPDATE
         SET filename = EXCLUDED.filename, content = EXCLUDED.content, uploaded_at = now()`,
      [source_file, basename(source_file), buf],
    );
    stored++;
    if (stored % 25 === 0) console.log(`  ${stored} stored...`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${basename(source_file)}: ${e.message}`);
  }
}
console.log(`done: stored=${stored} skipped(missing)=${skipped} failed=${failed}`);
await pool.end();
