// ETL: load the pipeline's SQLite base tables into Postgres (local dev, or Neon in prod).
// Reads mhp.db via libSQL, recreates + bulk-loads the base tables in Postgres. NEVER touches
// app-owned tables (overrides/audit_log/users/sessions/login_attempts/oauth_connections).
// Run: node --env-file=.env.local scripts/sync_to_pg.mjs
//
// `projects` is the exception to the drop-and-reload rule — see PROJECT_PIPELINE_COLS below.
// It used to be dropped like everything else, which silently destroyed every project created in
// the app, every field typed into "Edit details", and the completion_pct column itself. The
// pipeline only ever populates a handful of columns; it now writes just those.
import { createClient } from "@libsql/client";
import pg from "pg";

const SRC = process.env.MHP_DB ?? "file:/Users/jameswalton/Projects/mhp-brain/mhp.db";

// SQLite is no longer the working copy — Postgres is. estimates/line_items/unit_costs/lump_costs
// are still drop-and-reloaded below, so running this against a stale mhp.db silently replaces the
// live catalog and every estimate with whatever that file happens to hold. The duplicate-estimate
// removal and catalog rebuild done directly in Postgres (scripts/dedupe-and-rebuild-catalog.mjs)
// would be undone. Require an explicit acknowledgement rather than making that a one-typo mistake.
if (!process.argv.includes("--i-know-sqlite-is-the-source-of-truth")) {
  console.error(`
REFUSING TO RUN.

This reloads estimates, line_items, unit_costs and lump_costs into Postgres from:
  ${SRC}

Postgres is the source of truth for those tables now. Running this would discard the
deduplicated estimates and the rebuilt cost catalog.

If mhp.db really is current and you want it to win, re-run with:
  node --env-file=.env.local scripts/sync_to_pg.mjs --i-know-sqlite-is-the-source-of-truth

Back up first:  node --env-file=.env.local scripts/backup-pg.mjs
`);
  process.exit(1);
}

const src = createClient({ url: SRC });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const DDL = {
  projects: `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, type TEXT, market TEXT, status TEXT, last_activity TEXT, current_phase TEXT, contract_value TEXT, actual_start TEXT, actual_end TEXT, lead_source TEXT, lost_reason TEXT, client_name TEXT, client_phone TEXT, client_email TEXT, address TEXT, deposit_amount TEXT, deposit_date TEXT)`,
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
  // Realization factors from the actuals→catalog flywheel (flywheel.py). Recomputed from
  // closed jobs each run; read by the estimator via web/lib/flywheel.ts.
  realization_factors: `CREATE TABLE realization_factors (dimension TEXT, key TEXT, factor DOUBLE PRECISION, raw_factor DOUBLE PRECISION, n_jobs INTEGER, realization_mean DOUBLE PRECISION, realization_stdev DOUBLE PRECISION, updated_at TEXT, PRIMARY KEY (dimension, key))`,
};

// The only columns the pipeline is the source of truth for. Everything else on `projects` is
// app-owned — ops fields typed into "Edit details" (client_*, address, deposit_*, lead_source,
// current_phase, contract_value, actual_*) and completion_pct — and must survive a sync.
const PROJECT_PIPELINE_COLS = ["name", "type", "market", "status", "last_activity"];

// Merge, don't replace: upsert the pipeline's columns by id and leave app-created rows
// (projects added via POST /api/projects, which the pipeline has never heard of) in place.
async function mergeProjects(rows, cols) {
  const use = PROJECT_PIPELINE_COLS.filter((c) => cols.includes(c));
  for (const row of rows) {
    if (row.id == null) continue;
    const set = use.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const args = [row.id, ...use.map((c) => (row[c] === undefined ? null : row[c]))];
    await pool.query(
      `INSERT INTO projects (id, ${use.join(", ")}) VALUES ($1, ${use.map((_, i) => `$${i + 2}`).join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${set}`,
      args,
    );
  }
  const kept = await pool.query("SELECT count(*)::int AS n FROM projects");
  console.log(`projects: ${rows.length} merged, ${kept.rows[0].n} total (app-created rows kept)`);
}

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
  if (t === "projects") {
    await mergeProjects(r.rows, cols);
    continue;
  }
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
// `estimates` IS drop-and-reloaded above, so any estimate re-pointed at a different project in the
// app would revert to whatever folder the pipeline parsed it out of. Replay those corrections from
// the overrides table (which the pipeline never touches) so a reassignment sticks across syncs.
const reassigned = await pool.query(
  "SELECT entity_id, value FROM overrides WHERE entity_type='estimate' AND field='project_id' AND value IS NOT NULL",
);
for (const o of reassigned.rows) {
  await pool.query("UPDATE estimates SET project_id=$1 WHERE id=$2", [o.value, o.entity_id]);
}
if (reassigned.rows.length) console.log(`estimates: ${reassigned.rows.length} reassignment(s) replayed from overrides`);

await pool.end();
console.log("sync done ->", process.env.DATABASE_URL);
