#!/usr/bin/env node
// backup-pg.mjs — snapshot the app-owned half of the brain.
//
// backup.py covers mhp.db (the regenerable base data lives there and re-syncs via
// sync_to_pg.mjs). What it does NOT cover is everything the app itself writes to
// Neon: users, sessions, audit trail, uploaded documents (BYTEA), and all the
// operational tables (change orders, daily logs, payments, ...). Lose Neon, lose
// the company's operating record. This dumps those tables to the same iCloud
// folder backup.py uses, with the same daily/weekly retention.
//
// Usage:
//   node --env-file=.env.local scripts/backup-pg.mjs          # dump + prune
//   node --env-file=.env.local scripts/backup-pg.mjs --list   # show store
//
// Run nightly by the com.mhp.backup launchd job after backup.py.

import { execFileSync } from "node:child_process";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const DEST = join(
  homedir(),
  "Library/Mobile Documents/com~apple~CloudDocs/MHP-Brain-Backups"
);
const PREFIX = "neon-app-";
const KEEP_DAILY_DAYS = 14;
const KEEP_WEEKLY_WEEKS = 8;

// Everything the app writes that cannot be regenerated from mhp.db.
const APP_TABLES = [
  "users", "sessions", "overrides", "audit_log", "saved_estimates",
  "documents", "change_orders", "job_events", "job_photos", "permits",
  "callbacks", "sub_assignments", "payments", "oauth_connections",
  "password_resets", "login_attempts", "estimate_requests",
  "integration_settings", "teams_sync_state",
];

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED not set — run with --env-file=.env.local");
  process.exit(1);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function stampOf(name) {
  const m = name.match(/^neon-app-(\d{8})-(\d{6})\.sql\.gz$/);
  if (!m) return null;
  const [, d, t] = m;
  return new Date(
    +d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8),
    +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)
  );
}

function isoWeek(date) {
  // (year, week) key matching backup.py's isocalendar()[:2] semantics
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${week}`;
}

function prune() {
  const files = readdirSync(DEST).filter((f) => stampOf(f));
  const now = new Date();
  const keep = new Set();
  const seenWeeks = new Set();
  for (const f of files.sort((a, b) => stampOf(b) - stampOf(a))) {
    const ageDays = (now - stampOf(f)) / 86400000;
    if (ageDays <= KEEP_DAILY_DAYS) keep.add(f);
    else if (ageDays <= KEEP_WEEKLY_WEEKS * 7) {
      const wk = isoWeek(stampOf(f));
      if (!seenWeeks.has(wk)) { seenWeeks.add(wk); keep.add(f); }
    }
  }
  const pruned = files.filter((f) => !keep.has(f));
  for (const f of pruned) unlinkSync(join(DEST, f));
  return { kept: keep.size, pruned: pruned.length };
}

function list() {
  if (!existsSync(DEST)) { console.log(`no backup store yet at ${DEST}`); return; }
  const files = readdirSync(DEST).filter((f) => f.startsWith(PREFIX)).sort().reverse();
  console.log(`${files.length} neon backups in ${DEST}`);
  for (const f of files.slice(0, 20)) {
    const kb = statSync(join(DEST, f)).size / 1024;
    console.log(`  ${f}  ${kb < 1024 ? kb.toFixed(0) + "KB" : (kb / 1024).toFixed(1) + "MB"}`);
  }
}

async function main() {
  if (process.argv.includes("--list")) { list(); return; }

  // Never hang launchd: pg's default connect timeout is infinite, and a dead
  // TCP path to Neon wedged this script for 7h on 2026-07-02 (no Neon backup
  // landed Jul 1-2). Bounded connects + a hard watchdog; unref so the timer
  // itself never keeps the process alive.
  process.env.PGCONNECT_TIMEOUT ||= "30"; // libpq: also covers the pg_dump child
  setTimeout(() => {
    console.error("backup watchdog: 20min exceeded — aborting so tomorrow's run isn't blocked");
    process.exit(1);
  }, 20 * 60 * 1000).unref();

  // Only dump tables that actually exist — migrations land incrementally.
  const pool = new pg.Pool({
    connectionString: url, max: 1,
    connectionTimeoutMillis: 30000, statement_timeout: 120000, query_timeout: 120000,
  });
  const res = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [APP_TABLES]
  );
  const present = res.rows.map((r) => r.tablename);
  const missing = APP_TABLES.filter((t) => !present.includes(t));
  const counts = {};
  for (const t of present) {
    counts[t] = +(await pool.query(`SELECT count(*) AS n FROM "${t}"`)).rows[0].n;
  }
  await pool.end();

  if (present.length === 0) {
    console.error("none of the app tables exist — wrong database?");
    process.exit(1);
  }

  mkdirSync(DEST, { recursive: true });
  const ts = stamp();
  const raw = join(DEST, `.${PREFIX}${ts}.sql`);
  const out = join(DEST, `${PREFIX}${ts}.sql.gz`);

  // --clean --if-exists so a restore replaces rather than duplicates; --inserts
  // keeps the dump readable and restorable row-by-row if a table is mid-migration.
  const args = [
    url, "--no-owner", "--no-privileges", "--clean", "--if-exists",
    ...present.flatMap((t) => ["-t", `public.${t}`]),
    "-f", raw,
  ];
  // launchd runs with a bare PATH (no /usr/local/bin), so resolve pg_dump
  // absolutely or the nightly backup dies with spawnSync ENOENT. Fixed 2026-06-18.
  execFileSync(process.env.PG_DUMP ?? "/usr/local/bin/pg_dump", args, { stdio: ["ignore", "inherit", "inherit"] });

  await pipeline(createReadStream(raw), createGzip({ level: 9 }), createWriteStream(out));
  unlinkSync(raw);

  // Trust nothing: a dump that mentions none of our tables is not a backup.
  const gunzipped = execFileSync("gzip", ["-dc", out], { maxBuffer: 1024 * 1024 * 512 });
  const text = gunzipped.toString("utf8");
  const absent = present.filter((t) =>
    counts[t] > 0 &&
    !text.includes(`COPY public.${t} `) &&
    !text.includes(`INSERT INTO public.${t} `)
  );
  if (absent.length) {
    unlinkSync(out);
    console.error(`dump verification failed — missing data for: ${absent.join(", ")}`);
    process.exit(1);
  }

  const kb = statSync(out).size / 1024;
  const { kept, pruned } = prune();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`backed up -> ${out} (${kb < 1024 ? kb.toFixed(0) + "KB" : (kb / 1024).toFixed(1) + "MB"})`);
  console.log(`  ${present.length} tables, ${total} rows${missing.length ? ` · not yet migrated: ${missing.join(", ")}` : ""}`);
  console.log(`  store: ${kept} kept · ${pruned} pruned`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
