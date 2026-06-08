-- Public estimate requests submitted from the marketing site (northms-homepros).
-- App-owned, never touched by the base-table ETL. This is the funnel: a homeowner
-- asks for an estimate on the website and it lands here for staff to work.

CREATE TABLE IF NOT EXISTS estimate_requests (
  id           TEXT PRIMARY KEY,                  -- slug + short id
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  market       TEXT,                              -- Oxford / Tupelo / etc (free text)
  project_type TEXT,                              -- kitchen / bath / full remodel / addition / ...
  sqft         INTEGER,
  scope        TEXT,                              -- the homeowner's description
  status       TEXT NOT NULL DEFAULT 'new',       -- new | contacted | quoted | won | lost | spam
  source       TEXT NOT NULL DEFAULT 'website',
  ip           TEXT,                              -- for rate-limiting + abuse triage
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_estimate_requests_created ON estimate_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_estimate_requests_status  ON estimate_requests(status);
-- supports the per-IP, per-hour rate limit on the public intake endpoint
CREATE INDEX IF NOT EXISTS ix_estimate_requests_ip_time ON estimate_requests(ip, created_at DESC);
