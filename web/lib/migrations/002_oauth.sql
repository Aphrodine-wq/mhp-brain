-- Shared OAuth connection store. One row per (provider, account):
--   quickbooks -> account is the QB realmId (company);  gmail -> account is the dedicated intake box.
-- access_enc / refresh_enc are AES-256-GCM envelopes (lib/oauth/crypto.ts), NEVER plaintext; the key
-- lives in OAUTH_ENC_KEY, never in this file or the DB. Read-only scopes only. Like the other app
-- tables, the Python pipeline never touches this, so connections survive every re-extract.
CREATE TABLE IF NOT EXISTS oauth_connections (
  provider    TEXT NOT NULL,            -- 'quickbooks' | 'gmail'
  account     TEXT NOT NULL,            -- QB realmId, or the Gmail box address
  realm_id    TEXT,                     -- QB company id; NULL for gmail
  access_enc  TEXT NOT NULL,            -- AES-256-GCM envelope
  refresh_enc TEXT NOT NULL,            -- AES-256-GCM envelope
  expires_at  TEXT NOT NULL,            -- ISO; when the access token dies
  scope       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (provider, account)
);
