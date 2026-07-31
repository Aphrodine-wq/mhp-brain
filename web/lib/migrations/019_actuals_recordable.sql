-- Make `actuals` writable by the app.
--
-- This is the table the flywheel trains on: one confirmed closing cost per job, paired with the
-- bid that job went out at. It has been pipeline-only — populated by extract.py finding a
-- closeout spreadsheet, and by nothing else. So the training set has sat at 4 jobs, and the
-- estimator has been calibrating every new bid on four data points with a 0.46 standard
-- deviation, while 8 finished jobs with clean bids sit right there with no closing figure.
--
-- Nobody could enter one. That is the actual constraint, not the parser.
--
-- Adds an identity PK (there was none — rows were only ever bulk-loaded) and provenance, so an
-- office-entered closeout is distinguishable from a parsed one and attributable to a person.
-- `source` mirrors the convention used by documents/invoices: 'import' | 'manual'.

ALTER TABLE actuals ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE actuals ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE actuals ADD COLUMN IF NOT EXISTS recorded_by TEXT;
ALTER TABLE actuals ADD COLUMN IF NOT EXISTS recorded_at TEXT;
ALTER TABLE actuals ADD COLUMN IF NOT EXISTS note TEXT;

-- Everything already in the table came from the pipeline.
UPDATE actuals SET source = 'import' WHERE source IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'actuals_pkey') THEN
    ALTER TABLE actuals ADD CONSTRAINT actuals_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- One manual closeout per job: re-recording updates in place rather than stacking rows the
-- flywheel would then MAX() over. Parsed rows are exempt — a job can legitimately have several
-- closeout documents, which is why Jooste has three.
CREATE UNIQUE INDEX IF NOT EXISTS ux_actuals_manual_project
  ON actuals (project_id) WHERE source = 'manual';

CREATE INDEX IF NOT EXISTS ix_actuals_project ON actuals (project_id);
