// Idempotent migration runner (Postgres). Applies every .sql in lib/migrations in order.
// Run: node --env-file=.env.local scripts/migrate.mjs   (or set DATABASE_URL)
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const dir = join(dirname(fileURLToPath(import.meta.url)), "../lib/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  await pool.query(readFileSync(join(dir, f), "utf8")); // multi-statement DDL, no params
  console.log("applied", f);
}
console.log("migrations done ->", process.env.DATABASE_URL);
await pool.end();
