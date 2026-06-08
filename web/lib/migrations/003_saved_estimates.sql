-- App-owned table for estimates saved from the builder ("Save as Project").
-- Never touched by the base-table ETL, so saved work survives every re-sync.

CREATE TABLE IF NOT EXISTS saved_estimates (
  id          TEXT PRIMARY KEY,         -- slug + short id
  project     TEXT NOT NULL,            -- project name
  client_name TEXT,
  address     TEXT,
  est_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | won | lost
  markup      DOUBLE PRECISION NOT NULL DEFAULT 18,
  total       DOUBLE PRECISION NOT NULL DEFAULT 0,
  lines       JSONB NOT NULL,           -- the full editable line set
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_saved_estimates_created ON saved_estimates(created_at DESC);
