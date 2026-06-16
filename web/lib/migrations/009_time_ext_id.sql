-- Idempotent import support for time_entries. An external id per imported row so
-- re-running the BusyBusy importer UPSERTS instead of duplicating, and a bad import
-- is undoable by source. Office/field entries leave ext_id NULL — NULLs are distinct
-- in a Postgres unique index, so the index only constrains imported (non-null) rows.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ext_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_time_ext ON time_entries(ext_id);
