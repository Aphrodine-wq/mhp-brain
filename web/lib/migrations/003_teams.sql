-- Microsoft Teams integration tables. Stores synced messages from Teams channels and chats,
-- linked to brain projects where possible. All data is read-only from Graph API; the brain
-- never writes to Teams.

-- Teams/channels the brain watches. Populated on first sync; admin can toggle `watched`.
CREATE TABLE IF NOT EXISTS teams_channels (
  id            TEXT PRIMARY KEY,       -- Graph channel ID
  team_id       TEXT NOT NULL,          -- Graph team ID
  team_name     TEXT NOT NULL,
  channel_name  TEXT NOT NULL,
  watched       INTEGER NOT NULL DEFAULT 1,   -- 1 = sync messages, 0 = skip
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);

-- Synced messages from Teams channels and chats.
CREATE TABLE IF NOT EXISTS teams_messages (
  id            TEXT PRIMARY KEY,       -- Graph message ID
  channel_id    TEXT,                   -- NULL for 1:1/group chats
  chat_id       TEXT,                   -- NULL for channel messages
  sender_name   TEXT,
  sender_email  TEXT,
  body_preview  TEXT,                   -- first 500 chars of plaintext body
  body_html     TEXT,                   -- full HTML body for rendering
  sent_at       TEXT NOT NULL,          -- ISO timestamp from Graph
  has_attachments INTEGER NOT NULL DEFAULT 0,
  importance    TEXT,                   -- normal | high | urgent
  -- Project matching: NULL until matched, then the brain project slug.
  project_id    TEXT REFERENCES projects(id),
  match_method  TEXT,                   -- 'channel_name' | 'keyword' | 'manual' | NULL
  synced_at     TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_teams_msg_project ON teams_messages(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_teams_msg_sent ON teams_messages(sent_at DESC);

-- Attachments referenced in Teams messages (metadata only — files stay in OneDrive/SharePoint).
CREATE TABLE IF NOT EXISTS teams_attachments (
  id            TEXT PRIMARY KEY,       -- Graph attachment ID or driveItem ID
  message_id    TEXT NOT NULL REFERENCES teams_messages(id),
  name          TEXT NOT NULL,
  content_type  TEXT,
  content_url   TEXT,                   -- OneDrive/SharePoint URL
  size_bytes    INTEGER
);

-- Sync cursor: tracks the last delta link per channel/chat so we only pull new messages.
CREATE TABLE IF NOT EXISTS teams_sync_state (
  scope         TEXT PRIMARY KEY,       -- 'channel:<id>' or 'chat:<id>'
  delta_link    TEXT,                   -- Graph delta link for incremental sync
  last_sync_at  TEXT NOT NULL DEFAULT (now()::text)
);
