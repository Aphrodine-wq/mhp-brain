-- Link a saved estimate to the project it became when won.
ALTER TABLE saved_estimates ADD COLUMN IF NOT EXISTS project_id TEXT;
