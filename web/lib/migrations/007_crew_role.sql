-- Add the `crew` role: read-only tier for the field team ("everyone else" in the
-- Admin / CEO / Crew structure). Rank 0 like viewer — crew sees projects and the
-- crew roster, not client financials. Widen the CHECK; no rows need reassigning.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'ceo', 'estimator', 'sales', 'materials', 'editor', 'viewer', 'crew'));
