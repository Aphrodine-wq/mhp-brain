-- Percent complete on a job.
--
-- The phase milestones (lead → quoted → scheduled → in_progress → complete) are deliberately
-- coarse — they drive the client portal track. But the office talks about jobs in percentages
-- ("Kaiser's at 85"), and "in_progress" covers everything from 30% to 99%. Store the number
-- alongside the phase rather than replacing it: phase is the client-facing stage, completion_pct
-- is the internal read on how far along the work actually is.
--
-- NULL means "nobody has said yet", which is different from 0 ("hasn't started").

ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_pct INTEGER;

-- Range guard at the DB level as well as in updateProjectOps — the ops path does a dynamic
-- UPDATE, so a bad value would otherwise land silently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_completion_pct_range') THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_completion_pct_range
      CHECK (completion_pct IS NULL OR (completion_pct >= 0 AND completion_pct <= 100));
  END IF;
END $$;
