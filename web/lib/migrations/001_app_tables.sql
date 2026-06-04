-- App-owned tables (Postgres). Created idempotently. The Python pipeline + the base-table ETL
-- never DROP these, so corrections + auth + OAuth connections survive every re-sync.

CREATE TABLE IF NOT EXISTS overrides (
  entity_type TEXT NOT NULL,          -- 'project' | 'sub' | 'estimate' | 'live_flag'
  entity_id   TEXT NOT NULL,          -- project slug | norm(sub name) | estimate slug | "pid:flag_type"
  field       TEXT NOT NULL,          -- 'status'|'market'|'type'|'trade'|'phone'|'verified'|'dismissed'|'project_id'
  value       TEXT,                   -- new value as text; 'true'/'false' for booleans
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id, field)
);
CREATE INDEX IF NOT EXISTS ix_overrides_lookup ON overrides(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  entity_label TEXT,                  -- point-in-time name snapshot, so history reads forever
  field        TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  action       TEXT NOT NULL DEFAULT 'set'
);
CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts DESC);

CREATE TABLE IF NOT EXISTS users (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
  pass_hash  TEXT NOT NULL,           -- scrypt hash, hex
  salt       TEXT NOT NULL,           -- per-user salt, hex
  scope      TEXT,                    -- 'materials' | 'financial' | NULL
  created_at TEXT NOT NULL DEFAULT (now()::text),
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (now()::text),
  expires_at TEXT NOT NULL,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL,
  ts    TEXT NOT NULL DEFAULT (now()::text),
  ok    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_login_attempts ON login_attempts(email, ts);
