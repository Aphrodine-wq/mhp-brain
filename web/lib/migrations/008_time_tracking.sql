-- Native time tracking — the spine that replaces BusyBusy. ONE entry table feeds
-- both outputs: payroll (hours by worker) and job costing / estimate-vs-actual
-- (hours by job). Phase 1 is office/foreman entry; field self-punch (Phase 3)
-- writes the SAME table (source='field', clock_in/out). Nothing here is
-- BusyBusy-specific — it's just hours, worker, job, day.

-- Crew roster. Workers are NOT app users — they don't log into the brain; they're
-- the people whose hours get tracked against jobs.
CREATE TABLE IF NOT EXISTS workers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT,                           -- foreman | laborer | sub | ... (free text)
  pay_rate    REAL,                           -- hourly rate, for payroll $ (optional)
  active      INTEGER NOT NULL DEFAULT 1,     -- 1 = active, 0 = archived
  created_at  TEXT NOT NULL DEFAULT (now()::text)
);

-- The time spine. One row = one worker's hours on one job on one day.
CREATE TABLE IF NOT EXISTS time_entries (
  id          SERIAL PRIMARY KEY,
  worker_id   INTEGER NOT NULL REFERENCES workers(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  work_date   TEXT NOT NULL,                  -- ISO date (YYYY-MM-DD)
  hours       REAL NOT NULL,                  -- hours on this job this day
  source      TEXT NOT NULL DEFAULT 'office', -- office (foreman-entered) | field (self-punch)
  clock_in    TEXT,                           -- optional ISO timestamp (field punch, Phase 3)
  clock_out   TEXT,                           -- optional ISO timestamp (field punch, Phase 3)
  note        TEXT,
  entered_by  TEXT,                           -- server-side actor (office) or worker (field)
  created_at  TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_time_project ON time_entries(project_id, work_date DESC);
CREATE INDEX IF NOT EXISTS ix_time_worker  ON time_entries(worker_id, work_date DESC);
