// BusyBusy -> MHP Brain time importer. One-time historical backfill so job-health
// and estimate-vs-actual can measure MHP's real labor leakage.
//
// Usage (DRY RUN by default — writes nothing, just reports what would land):
//   node --env-file=.env.local scripts/import-busybusy.mjs <export.csv>
//   node --env-file=.env.local scripts/import-busybusy.mjs <export.csv> --commit
//
// Idempotent: each row gets a stable ext_id, so re-running upserts (never doubles).
// Undo a bad import:  DELETE FROM time_entries WHERE source='busybusy';
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const file = process.argv[2];
const commit = process.argv.includes("--commit");
if (!file || file.startsWith("--")) {
  console.error("usage: node --env-file=.env.local scripts/import-busybusy.mjs <export.csv> [--commit]");
  process.exit(2);
}

// --- minimal CSV parser: handles quoted fields with commas/newlines inside ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// --- column auto-detection (BusyBusy's headers vary by report) ---
const HEADER_MAP = {
  worker: ["member", "employee", "name", "full name", "worker", "user"],
  project: ["project", "job", "title", "project title", "job name"],
  date: ["date", "day", "work date", "date worked", "start date"],
  hours: ["hours", "total hours", "duration", "time", "total", "hours worked"],
  extid: ["id", "entry id", "time entry id", "uuid", "guid"],
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function detectCols(headers) {
  const hs = headers.map(norm);
  const find = (cands) => {
    for (const c of cands) { const i = hs.indexOf(c); if (i >= 0) return i; }
    for (let i = 0; i < hs.length; i++) if (cands.some((c) => hs[i].includes(c))) return i;
    return -1;
  };
  const out = {};
  for (const [k, cands] of Object.entries(HEADER_MAP)) out[k] = find(cands);
  return out;
}

// --- project matcher: mirrors web/lib/match-project.ts exactly ---
const STOP = new Set(["project","projects","house","home","build","building","master","file","docs","construction","porch","room","remodel","renovation","repair","improvement","addition","garage","kitchen","bathroom","deck","wall","retaining","bonus","custom","guest","the","and","mhp","prime","complete","with","docusign","contract","permit","plan","sign","active","dead"]);
function matchProject(projects, haystack) {
  const hay = new Set(norm(haystack).split(" "));
  let best = null;
  for (const p of projects) {
    const toks = norm(p.name).split(" ").filter((t) => t.length > 3 && !STOP.has(t));
    if (!toks.length) continue;
    const hits = toks.filter((t) => hay.has(t)).length;
    const score = hits / toks.length;
    if (hits >= 1 && score >= 0.5 && (!best || hits > best.hits || (hits === best.hits && score > best.score))) best = { p, hits, score };
  }
  return best?.p ?? null;
}
function matchWorker(crew, name) {
  const n = norm(name);
  for (const c of crew) if (norm(c) === n) return c;
  for (const c of crew) if (n && (norm(c).includes(n) || n.includes(norm(c)))) return c;
  return null;
}

const parseHours = (s) => {
  s = String(s).trim();
  if (/^\d+:\d+/.test(s)) { const [h, m] = s.split(":"); return Number(h) + Number(m) / 60; }
  return Number(s.replace(/[^0-9.]/g, "")) || 0;
};
const parseDate = (s) => {
  const d = new Date(String(s).trim());
  return Number.isNaN(d.getTime()) ? String(s).trim().slice(0, 10) : d.toISOString().slice(0, 10);
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length < 2) { console.error("no data rows in CSV"); process.exit(1); }
  const headers = rows[0];
  const cols = detectCols(headers);
  console.log("Detected columns:", Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, i >= 0 ? headers[i] : "(not found)"])));
  if (cols.worker < 0 || cols.project < 0 || cols.date < 0 || cols.hours < 0) {
    console.error("\nCouldn't auto-map worker/project/date/hours. Headers in your file:");
    console.error("  " + headers.join(" | "));
    console.error("Send me these headers and I'll wire the mapping.");
    process.exit(1);
  }

  const projects = (await pool.query("SELECT id, name FROM projects")).rows;
  let crew = [];
  try { crew = (await pool.query("SELECT name FROM crew")).rows.map((r) => r.name); } catch { /* no crew table */ }

  const data = rows.slice(1);
  const unmatchedProjects = new Map();
  const unmatchedWorkers = new Set();
  const toWrite = [];
  let totalHours = 0, matchedHours = 0;

  for (const r of data) {
    const wname = (r[cols.worker] ?? "").trim();
    const pname = (r[cols.project] ?? "").trim();
    const date = parseDate(r[cols.date]);
    const hours = parseHours(r[cols.hours]);
    if (!pname || hours <= 0) continue;
    totalHours += hours;
    const proj = matchProject(projects, pname);
    if (!proj) { unmatchedProjects.set(pname, (unmatchedProjects.get(pname) || 0) + 1); continue; }
    const worker = (crew.length ? matchWorker(crew, wname) : null) ?? wname;
    if (crew.length && !matchWorker(crew, wname)) unmatchedWorkers.add(wname);
    matchedHours += hours;
    const ext = cols.extid >= 0 && r[cols.extid]
      ? `bb:${r[cols.extid]}`
      : `bb:${createHash("sha1").update([wname, proj.id, date, hours].join("|")).digest("hex").slice(0, 16)}`;
    toWrite.push({ ext_id: ext, worker_name: worker, project_id: proj.id, work_date: date, hours, note: `BusyBusy: ${pname}` });
  }

  console.log(`\n${data.length} rows · ${totalHours.toFixed(1)}h total`);
  console.log(`Matched to a job: ${toWrite.length} entries · ${matchedHours.toFixed(1)}h`);
  const unmatchedRows = [...unmatchedProjects.values()].reduce((a, b) => a + b, 0);
  console.log(`Unmatched jobs: ${unmatchedProjects.size} distinct names (${unmatchedRows} rows) — these get skipped until matched`);
  if (unmatchedProjects.size) {
    console.log("  top unmatched: " + [...unmatchedProjects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `"${n}" (${c})`).join(", "));
  }
  if (unmatchedWorkers.size) console.log(`Workers not on the crew roster (imported by name): ${[...unmatchedWorkers].slice(0, 20).join(", ")}`);

  if (!commit) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to import the ${toWrite.length} matched entries.`);
    process.exit(0);
  }

  let inserted = 0, updated = 0;
  for (const e of toWrite) {
    const res = await pool.query(
      `INSERT INTO time_entries (ext_id, worker_name, project_id, work_date, hours, source, note, entered_by, created_at)
       VALUES ($1,$2,$3,$4,$5,'busybusy',$6,'import:busybusy', now()::text)
       ON CONFLICT (ext_id) DO UPDATE SET hours = EXCLUDED.hours, work_date = EXCLUDED.work_date, worker_name = EXCLUDED.worker_name
       RETURNING (xmax = 0) AS inserted`,
      [e.ext_id, e.worker_name, e.project_id, e.work_date, e.hours, e.note],
    );
    if (res.rows[0].inserted) inserted++; else updated++;
  }
  console.log(`\nImported: ${inserted} new, ${updated} updated (idempotent by ext_id). source='busybusy'.`);
  console.log("Undo:  DELETE FROM time_entries WHERE source='busybusy';");
} finally {
  await pool.end();
}
