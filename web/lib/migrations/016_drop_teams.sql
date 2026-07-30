-- Remove the Teams sync.
--
-- It was never used: no Microsoft OAuth connection was ever made, all four tables held zero
-- rows, and TEAMS_WEBHOOK_URL was never set. The code (lib/teams.ts, /api/teams/*) and
-- migration 003_teams.sql are deleted with it.
--
-- NOTE: lib/alerts.ts is deliberately NOT removed. It posts through a Teams incoming webhook,
-- but it is the notification backbone for nine call sites (price sensor, estimate save, bid
-- guard, payments, callbacks, permits, change orders) — a delivery channel, not the Teams sync.
-- Repointing it is a separate decision.
DROP TABLE IF EXISTS teams_attachments;
DROP TABLE IF EXISTS teams_messages;
DROP TABLE IF EXISTS teams_channels;
DROP TABLE IF EXISTS teams_sync_state;
