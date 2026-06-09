// Upload each estimate's original .xlsx to Vercel Blob and record the URL on its estimate rows.
// The URL is stored in mhp.db (source_url) and served only through the auth-gated download route.
// Needs BLOB_READ_WRITE_TOKEN (create a Vercel Blob store first). Run:
//   cd web && node --env-file=.env.local scripts/upload_estimates_to_blob.mjs
import { put } from "@vercel/blob";
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename } from "node:path";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("Missing BLOB_READ_WRITE_TOKEN — create a Vercel Blob store, then add the token to .env.local.");
  process.exit(1);
}

const DB = process.env.MHP_DB ?? "file:/Users/jameswalton/Projects/mhp-brain/mhp.db";
const db = createClient({ url: DB });

// Idempotent: add the column if a prior run didn't.
try { await db.execute(`ALTER TABLE estimates ADD COLUMN source_url TEXT`); } catch { /* already exists */ }

const rows = (await db.execute(`SELECT DISTINCT source_file FROM estimates WHERE source_file IS NOT NULL`)).rows;
let done = 0, skipped = 0, failed = 0;

for (const row of rows) {
  const sf = row.source_file ? String(row.source_file) : "";
  if (!sf || !existsSync(sf)) { skipped++; continue; }
  try {
    const buf = await readFile(sf);
    // addRandomSuffix: distinct paths sometimes share a basename; keep every upload unique.
    const { url } = await put(`estimates/${basename(sf)}`, buf, {
      access: "public",
      token,
      addRandomSuffix: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await db.execute({ sql: `UPDATE estimates SET source_url = ? WHERE source_file = ?`, args: [url, sf] });
    done++;
    if (done % 25 === 0) console.log(`  ${done} uploaded...`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${basename(sf)}: ${e.message}`);
  }
}
console.log(`done: uploaded=${done} skipped(missing)=${skipped} failed=${failed}`);
