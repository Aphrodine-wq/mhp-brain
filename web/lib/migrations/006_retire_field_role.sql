-- Retire the `field` role. The Field Log / Daily Log Call / Live surfaces it drove
-- are gone, so the role no longer has a home — its users fall through to the default
-- dashboard.
--
-- Reassign any existing field users to `editor` first: both sit at rank 1 (editor-level
-- writes), so this preserves their exact access. Do this BEFORE tightening the CHECK so
-- no surviving row violates the new constraint. Change the target here if a different
-- landing role is wanted.

UPDATE users SET role = 'editor' WHERE role = 'field';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'ceo', 'estimator', 'sales', 'materials', 'editor', 'viewer'));
