-- Self-service auth: password reset tokens + room for self-registered (pending) accounts.
-- Created idempotently alongside the other app-owned tables.

-- Password reset tokens. The raw token lives only in the emailed link; we store its SHA-256
-- hash, so a DB leak can't be replayed to reset anyone's password. Single-use + short-lived.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,                 -- sha256(raw token), hex
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,                    -- ISO string; compared as ::timestamptz
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_password_resets_user ON password_resets(user_id);

-- Self-registered accounts land here as active=0 ("pending admin approval"). No schema change is
-- needed — the existing users.active flag already gates every login + OAuth path — but we index it
-- so the admin "who's waiting" lookup stays cheap as the table grows.
CREATE INDEX IF NOT EXISTS ix_users_pending ON users(active) WHERE active = 0;
