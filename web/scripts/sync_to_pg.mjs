// ETL: load the pipeline's SQLite base tables into Postgres (local dev, or Neon in prod).
// Reads mhp.db via libSQL, recreates + bulk-loads the 8 base tables in Postgres. NEVER touches
// app-owned tables (overrides/audit_log/users/sessions/login_attempts/oauth_connections).
// Run: node --env-file=.env.local scripts/sync_to_pg.mjs
import { createClient } from "@libsql/client";
import pg from "pg";

const SRC = process.env.MHP_DB ?? "file:/Users/jameswalton/Projects/mhp-brain/mhp.db";
const src = createClient({ url: SRC });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const DDL = {
  projects: `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, type TEXT, market TEXT, status TEXT, last_activity TEXT)`,
  estimates: `CREATE TABLE estimates (id TEXT PRIMARY KEY, project_id TEXT, source_file TEXT, source_type TEXT, sheet TEXT, line_item_count INTEGER, sum_item_total DOUBLE PRECISION, sum_sov_total DOUBLE PRECISION, stated_total DOUBLE PRECISION, parse_confidence TEXT, flags TEXT, est_date TEXT)`,
  line_items: `CREATE TABLE line_items (id BIGINT, estimate_id TEXT, division TEXT, item_no TEXT, description TEXT, qty DOUBLE PRECISION, unit TEXT, unit_price DOUBLE PRECISION, material DOUBLE PRECISION, labor DOUBLE PRECISION, sub_bid DOUBLE PRECISION, item_total DOUBLE PRECISION, sov_total DOUBLE PRECISION, sub_name TEXT, norm_unit TEXT, price_kind TEXT, canon_desc TEXT)`,
  actuals: `CREATE TABLE actuals (project_id TEXT, source_file TEXT, closing_total DOUBLE PRECISION)`,
  unit_costs: `CREATE TABLE unit_costs (item_no TEXT, canon_desc TEXT, division TEXT, description TEXT, unit TEXT, n_lines INTEGER, n_jobs INTEGER, median_unit_price DOUBLE PRECISION, p25 DOUBLE PRECISION, p75 DOUBLE PRECISION, min_price DOUBLE PRECISION, max_price DOUBLE PRECISION, kind TEXT)`,
  lump_costs: `CREATE TABLE lump_costs (item_no TEXT, canon_desc TEXT, division TEXT, description TEXT, n_jobs INTEGER, median_total DOUBLE PRECISION, p25 DOUBLE PRECISION, p75 DOUBLE PRECISION)`,
  subs: `CREATE TABLE subs (name TEXT, trade TEXT, phone TEXT, jobs INTEGER, projects TEXT, source TEXT)`,
  crew: `CREATE TABLE crew (name TEXT, role TEXT, rate TEXT, phone TEXT, email TEXT)`,
  // Per-job actual cost from QuickBooks (qb_pnl.py). Only exists once the book has
  // been pulled — the loop below skips it gracefully before the first QB connect.
  qb_job_costs: `CREATE TABLE qb_job_costs (project_id TEXT PRIMARY KEY, qb_id TEXT, labor_cost DOUBLE PRECISION, total_cost DOUBLE PRECISION, labor_hours DOUBLE PRECISION, updated_at TEXT)`,
};

for (const [t, ddl] of Object.entries(DDL)) {
  let r;
  try {
    r = await src.execute(`SELECT * FROM ${t}`);
  } catch {
    // Source table not present yet (e.g. qb_job_costs before the first QB pull).
    // Leave any existing Postgres copy untouched and move on.
    console.log(`${t}: skipped (not in mhp.db yet)`);
    continue;
  }
  const cols = r.columns;
  await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  await pool.query(ddl);
  const CHUNK = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < r.rows.length; i += CHUNK) {
    const slice = r.rows.slice(i, i + CHUNK);
    const params = [];
    const tuples = slice.map((row) => {
      const ph = cols.map((c) => {
        const v = row[c];
        params.push(v === undefined ? null : v);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await pool.query(`INSERT INTO ${t} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
  console.log(`${t}: ${r.rows.length} rows`);
}
await pool.end();
console.log("sync done ->", process.env.DATABASE_URL);
