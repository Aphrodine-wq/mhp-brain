-- Expand the role system from 3 generic tiers (admin/editor/viewer) to
-- function-specific roles that drive per-role dashboards and nav.
--
-- The role column stays a simple text enum — no junction tables, no RBAC framework.
-- Every role is a superset of viewer. Admin is a superset of everything.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'ceo', 'field', 'estimator', 'sales', 'materials', 'editor', 'viewer'));

-- Existing users keep their current role. New roles:
--   ceo        — Rick's cockpit: cash, margins, exceptions, decisions
--   field      — Josh/Jason: daily log, active jobs, subs, permits
--   estimator  — estimate builder, cost catalog, bid history, reprice
--   sales      — Todd: leads pipeline, intake, follow-ups, conversion
--   materials  — Sandi: price tracking, vendor accounts, cost confirmations
--   admin      — Walt/James: everything + integrations + user management
--   viewer     — read-only access to everything (no write)
