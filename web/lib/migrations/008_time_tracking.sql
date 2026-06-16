-- Native time tracking — the spine that replaces BusyBusy. One row = one worker's
-- hours on one job on one day. Feeds both payroll (hours by worker) and job
-- costing / estimate-vs-actual (hours by project). Field self-punch (Phase 3)
-- writes the SAME table (source='field', clock_in/out).
--
-- Workers come from the EXISTING `crew` roster (see crewList()), keyed by name —
-- NOT a new table. Time tracking should never make you maintain a second roster.

CREATE TABLE IF NOT EXISTS time_entries (
  id           SERIAL PRIMARY KEY,
  worker_name  TEXT NOT NULL,                 -- a crew member's name (from crewList)
  project_id   TEXT NOT NULL REFERENCES projects(id),
  work_date    TEXT NOT NULL,                 -- ISO date (YYYY-MM-DD)
  hours        REAL NOT NULL,                 -- hours on this job this day
  source       TEXT NOT NULL DEFAULT 'office',-- office (foreman-entered) | field (self-punch, Phase 3)
  clock_in     TEXT,                          -- optional ISO timestamp (field punch)
  clock_out    TEXT,                          -- optional ISO timestamp (field punch)
  note         TEXT,
  entered_by   TEXT,                          -- server-side actor (office) or worker (field)
  created_at   TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_time_project ON time_entries(project_id, work_date DESC);
CREATE INDEX IF NOT EXISTS ix_time_worker  ON time_entries(worker_name, work_date DESC);
