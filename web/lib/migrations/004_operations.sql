-- Operational context tables: everything the pricing brain is blind to.
-- Closes the 12 context gaps: change orders, daily logs, payments, photos,
-- permits, callbacks, sub assignments, lead tracking, and actual dates.

-- Extend projects with operational fields the brain currently infers or ignores.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lead_source    TEXT;  -- referral | google | facebook | repeat | nextdoor | yard_sign | other
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lost_reason    TEXT;  -- price | timing | scope | competitor | ghosted | not_qualified | other
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_start   TEXT;  -- ISO date, not inferred from folder mtime
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_end     TEXT;  -- ISO date
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_phase  TEXT;  -- lead | quoted | scheduled | in_progress | complete | paid | warranty
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name    TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_phone   TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email   TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value REAL;  -- signed contract amount (may differ from estimate)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount REAL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_date   TEXT;

-- Change orders: the #1 margin killer. Every scope change, in writing, before execution.
CREATE TABLE IF NOT EXISTS change_orders (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  description   TEXT NOT NULL,
  amount        REAL NOT NULL,              -- positive = add, negative = deduction
  requested_by  TEXT,                       -- client name or "MHP"
  approved      INTEGER NOT NULL DEFAULT 0, -- 0 = pending, 1 = approved, -1 = rejected
  approved_date TEXT,
  billed        INTEGER NOT NULL DEFAULT 0, -- 0 = not billed, 1 = billed
  billed_date   TEXT,
  notes         TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_co_project ON change_orders(project_id);

-- Job events: daily logs, phone calls, site visits, decisions, notes.
-- One table for all event types — type column distinguishes them.
CREATE TABLE IF NOT EXISTS job_events (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  event_type    TEXT NOT NULL,              -- daily_log | phone_call | site_visit | decision | note | meeting
  event_date    TEXT NOT NULL,              -- ISO date
  summary       TEXT NOT NULL,              -- what happened (1-2 sentences)
  detail        TEXT,                       -- longer notes if needed
  crew_present  TEXT,                       -- comma-separated names
  hours_worked  REAL,                       -- total crew hours this day (for daily_log)
  weather       TEXT,                       -- for daily_log: clear | rain | delay
  action_items  TEXT,                       -- what needs to happen next
  logged_by     TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_events_project ON job_events(project_id, event_date DESC);

-- Job photos: metadata only — files stay in OneDrive/SharePoint.
CREATE TABLE IF NOT EXISTS job_photos (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  file_path     TEXT,                       -- OneDrive/local path or URL
  file_url      TEXT,                       -- public/signed URL if hosted
  phase         TEXT,                       -- before | during | after | issue | marketing
  caption       TEXT,
  taken_at      TEXT,                       -- ISO timestamp from EXIF or manual
  uploaded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_photos_project ON job_photos(project_id);

-- Permits and inspections: deadline-driven, currently untracked.
CREATE TABLE IF NOT EXISTS permits (
  id              SERIAL PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  permit_type     TEXT NOT NULL,            -- building | electrical | plumbing | mechanical | demo | other
  permit_number   TEXT,
  applied_date    TEXT,
  approved_date   TEXT,
  expires_date    TEXT,
  inspection_date TEXT,
  inspection_result TEXT,                   -- passed | failed | pending | not_needed
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_permits_project ON permits(project_id);

-- Warranty callbacks: pattern detection needs data.
CREATE TABLE IF NOT EXISTS callbacks (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  reported_date TEXT NOT NULL,
  issue         TEXT NOT NULL,              -- what the customer reported
  cause         TEXT,                       -- root cause (if known)
  category      TEXT,                       -- plumbing | electrical | framing | tile | paint | roofing | other
  covered       INTEGER NOT NULL DEFAULT 1, -- 1 = warranty covers it, 0 = out of warranty
  resolution    TEXT,
  resolved_date TEXT,
  cost_to_fix   REAL,                       -- what it cost MHP to fix
  logged_by     TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_callbacks_project ON callbacks(project_id);

-- Sub assignments: who's scheduled, who showed up, how they performed.
CREATE TABLE IF NOT EXISTS sub_assignments (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  sub_name      TEXT NOT NULL,              -- matches subs.name
  trade         TEXT,                       -- electrical | plumbing | hvac | roofing | concrete | framing | other
  scheduled_date TEXT,
  showed_up     INTEGER,                    -- 1 = yes, 0 = no, NULL = not yet
  quoted_amount REAL,                       -- what the sub quoted
  actual_amount REAL,                       -- what was actually paid (from QB)
  performance   INTEGER,                    -- 1-5 rating, NULL = not rated
  notes         TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_sub_assign_project ON sub_assignments(project_id);

-- Payments: track what's been collected per job (until QB automates this).
CREATE TABLE IF NOT EXISTS payments (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  amount        REAL NOT NULL,
  payment_date  TEXT NOT NULL,
  method        TEXT,                       -- check | card | ach | cash | draw | other
  payment_type  TEXT,                       -- deposit | progress | final | change_order
  reference     TEXT,                       -- check number, transaction ID, etc.
  notes         TEXT,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_payments_project ON payments(project_id);
