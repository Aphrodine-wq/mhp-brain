// Remove duplicate estimates, then rebuild the cost catalog from what is left — in Postgres.
//
// Why this exists: normalize.py builds unit_costs/lump_costs from mhp.db (SQLite), which is no
// longer the working copy. DEDUP.md flagged the remaining gap in June ("point normalize.py at
// canonical_line_items") and it was never done, so every catalog median has been computed over
// duplicate line items. This does the dedup and the rebuild against Neon directly.
//
// A duplicate here is strict: same project, an identical ordered digest of its line items, AND
// the same sum_sov_total. Revisions of a bid are NOT duplicates and are left alone — only the
// same file reachable by two folder paths.
//
// The sum_sov_total part of that key is load-bearing. Matching on content alone pulled in five
// more groups where the line items are identical but the stored bid differs — Gill spans
// $276,277.52-$276,839.72 across three copies, and one of Michael Mason's two reads $0.00 against
// the other's $103,300.16. Identical lines with a different sell price is a re-marked revision or
// a bad parse, and picking a winner by id would have been a coin flip on which bid survives.
// Those are reported at the end for a human to settle, never deleted here.
//
// Bucketing mirrors normalize.py exactly:
//   unit_costs  key (item_no, canon_desc, norm_unit), price_kind='UNIT_RATE', unit_price > 0
//   lump_costs  key (item_no, canon_desc),            price_kind='LUMP_SUM',  item_total > 0
//   both require >= 2 contributing lines; SUPERSEDED estimates are excluded from the catalog
//   but keep their line_items (real history)
//   median/p25/p75 = percentile_cont (Python's quantile() is the same linear interpolation)
//   rounding via py_round2() — see migration 015
//
// Run: node --env-file=.env.local scripts/dedupe-and-rebuild-catalog.mjs [--apply]
// Without --apply it reports what would change and rolls back.
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();

const UNIT_SQL = `
  SELECT li.item_no, li.canon_desc, li.norm_unit AS unit,
         min(li.division) AS division, min(li.description) AS description,
         count(*) AS n_lines, count(DISTINCT li.estimate_id) AS n_jobs,
         py_round2(percentile_cont(0.5)  WITHIN GROUP (ORDER BY li.unit_price)) AS median_unit_price,
         py_round2(percentile_cont(0.25) WITHIN GROUP (ORDER BY li.unit_price)) AS p25,
         py_round2(percentile_cont(0.75) WITHIN GROUP (ORDER BY li.unit_price)) AS p75,
         py_round2(min(li.unit_price)) AS min_price,
         py_round2(max(li.unit_price)) AS max_price
  FROM line_items li JOIN estimates e ON e.id = li.estimate_id
  WHERE li.price_kind = 'UNIT_RATE' AND li.unit_price > 0 AND e.parse_confidence <> 'SUPERSEDED'
  GROUP BY li.item_no, li.canon_desc, li.norm_unit
  HAVING count(*) >= 2`;

const LUMP_SQL = `
  SELECT li.item_no, li.canon_desc,
         min(li.division) AS division, min(li.description) AS description,
         count(DISTINCT li.estimate_id) AS n_jobs,
         py_round2(percentile_cont(0.5)  WITHIN GROUP (ORDER BY li.item_total)) AS median_total,
         py_round2(percentile_cont(0.25) WITHIN GROUP (ORDER BY li.item_total)) AS p25,
         py_round2(percentile_cont(0.75) WITHIN GROUP (ORDER BY li.item_total)) AS p75
  FROM line_items li JOIN estimates e ON e.id = li.estimate_id
  WHERE li.price_kind = 'LUMP_SUM' AND li.item_total > 0 AND e.parse_confidence <> 'SUPERSEDED'
  GROUP BY li.item_no, li.canon_desc
  HAVING count(*) >= 2`;

await c.query("BEGIN");
try {
  // Snapshot the catalog before touching anything, so the report is a real diff.
  // item_no is part of the key: (canon_desc, unit) is NOT unique — "floor tile labor / sqft"
  // exists under two item numbers — and joining without it cross-joins into invented movements.
  // ON COMMIT DROP, and dropped up front: Neon pools connections, so a temp table from an earlier
  // run can still be attached to the backend session this run is handed. Without this the second
  // invocation dies on "relation before_unit already exists" and rolls the whole rebuild back.
  await c.query(`DROP TABLE IF EXISTS before_unit`);
  await c.query(`CREATE TEMP TABLE before_unit ON COMMIT DROP AS
                 SELECT item_no, canon_desc, unit, median_unit_price FROM unit_costs`);

  // ---- 1. find duplicates: identical content, not merely identical totals -------------------
  const dupes = await c.query(`
    WITH fp AS (
      SELECT e.id, e.project_id, e.sum_sov_total, e.line_item_count,
             md5(string_agg(coalesce(li.description,'')||'|'||coalesce(li.qty::text,'')||'|'||
                            coalesce(li.unit_price::text,'')||'|'||coalesce(li.item_total::text,''),
                            E'\n' ORDER BY li.item_no, li.description, li.item_total)) AS digest
      FROM estimates e JOIN line_items li ON li.estimate_id = e.id
      GROUP BY e.id, e.project_id, e.sum_sov_total, e.line_item_count
    ),
    ranked AS (
      SELECT id, project_id, digest,
             row_number() OVER (PARTITION BY project_id, digest, sum_sov_total ORDER BY id) AS rn
      FROM fp
    )
    SELECT id, project_id FROM ranked WHERE rn > 1`);

  const ids = dupes.rows.map((r) => r.id);
  console.log(`duplicate estimates to remove: ${ids.length}`);
  for (const r of dupes.rows) console.log(`  ${r.project_id}  ${r.id}`);

  if (ids.length) {
    const li = await c.query(`DELETE FROM line_items WHERE estimate_id = ANY($1::text[])`, [ids]);
    const es = await c.query(`DELETE FROM estimates  WHERE id         = ANY($1::text[])`, [ids]);
    console.log(`\nremoved ${es.rowCount} estimates and ${li.rowCount} line items`);
  }

  // ---- 2. rebuild the catalog ---------------------------------------------------------------
  await c.query("DELETE FROM unit_costs");
  await c.query(`INSERT INTO unit_costs
      (item_no, canon_desc, division, description, unit, n_lines, n_jobs,
       median_unit_price, p25, p75, min_price, max_price, kind)
    SELECT item_no, canon_desc, division, description, unit, n_lines, n_jobs,
           median_unit_price, p25, p75, min_price, max_price, 'UNIT_RATE' FROM (${UNIT_SQL}) u`);

  await c.query("DELETE FROM lump_costs");
  await c.query(`INSERT INTO lump_costs
      (item_no, canon_desc, division, description, n_jobs, median_total, p25, p75)
    SELECT item_no, canon_desc, division, description, n_jobs, median_total, p25, p75
    FROM (${LUMP_SQL}) l`);

  // ---- 3. report the price movement ----------------------------------------------------------
  const moved = await c.query(`
    SELECT b.canon_desc, b.unit, b.median_unit_price AS was, u.median_unit_price AS now
    FROM before_unit b JOIN unit_costs u
      ON coalesce(u.item_no,'') = coalesce(b.item_no,'')
     AND u.canon_desc = b.canon_desc
     AND coalesce(u.unit,'') = coalesce(b.unit,'')
    WHERE u.median_unit_price IS DISTINCT FROM b.median_unit_price
    ORDER BY abs(u.median_unit_price - b.median_unit_price) DESC`);

  // Identical line items, different stored bid — a human call, never an automatic delete.
  const ambiguous = await c.query(`
    WITH fp AS (
      SELECT e.id, e.project_id, e.sum_sov_total,
             md5(string_agg(coalesce(li.description,'')||'|'||coalesce(li.qty::text,'')||'|'||
                            coalesce(li.unit_price::text,'')||'|'||coalesce(li.item_total::text,''),
                            E'\n' ORDER BY li.item_no, li.description, li.item_total)) AS digest
      FROM estimates e JOIN line_items li ON li.estimate_id = e.id
      GROUP BY e.id, e.project_id, e.sum_sov_total
    )
    SELECT project_id, count(*) copies,
           min(sum_sov_total)::numeric(12,2) lo, max(sum_sov_total)::numeric(12,2) hi
    FROM fp GROUP BY project_id, digest
    HAVING count(*) > 1 AND count(DISTINCT sum_sov_total) > 1
    ORDER BY project_id`);

  const counts = await c.query(`SELECT (SELECT count(*) FROM unit_costs) u, (SELECT count(*) FROM lump_costs) l,
                                       (SELECT count(*) FROM estimates) e, (SELECT count(*) FROM line_items) li`);
  console.log(`\ncatalog: ${counts.rows[0].u} unit-cost + ${counts.rows[0].l} lump-sum entries`);
  console.log(`book:    ${counts.rows[0].e} estimates, ${counts.rows[0].li} line items`);
  console.log(`\nprices that moved: ${moved.rowCount}`);
  for (const m of moved.rows.slice(0, 15)) {
    console.log(`  ${String(m.canon_desc).slice(0, 34).padEnd(34)} ${String(m.unit ?? "").padEnd(10)} ${String(m.was).padStart(11)} -> ${String(m.now).padStart(11)}`);
  }
  if (moved.rowCount > 15) console.log(`  … and ${moved.rowCount - 15} more`);

  if (ambiguous.rowCount) {
    console.log(`\nNOT TOUCHED — identical line items but different stored bid (${ambiguous.rowCount}):`);
    for (const a of ambiguous.rows) {
      console.log(`  ${String(a.project_id).padEnd(38)} ${a.copies} copies  $${a.lo} … $${a.hi}`);
    }
  }

  if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED"); }
  else { await c.query("ROLLBACK"); console.log("\nDRY RUN — rolled back. Re-run with --apply to keep."); }
} catch (e) {
  await c.query("ROLLBACK");
  console.error("rolled back:", e.message);
  process.exitCode = 1;
} finally { c.release(); await pool.end(); }
