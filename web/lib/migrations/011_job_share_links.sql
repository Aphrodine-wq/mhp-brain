-- Public client-portal links: a long-lived, revocable token per job. Only the SHA-256 hash is
-- stored, so a DB read can't be replayed into a working link.
CREATE TABLE IF NOT EXISTS job_share_links (
  token_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_share_links_project ON job_share_links(project_id);
