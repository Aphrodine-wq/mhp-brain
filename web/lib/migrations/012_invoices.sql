-- Invoices: vendor bills tied to a project so we can see real spend against the bid.
-- Manual entry first; Gmail capture feeds the same table later.

CREATE TABLE IF NOT EXISTS invoices (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  vendor        TEXT NOT NULL,
  amount        REAL NOT NULL,
  invoice_date  TEXT NOT NULL,
  notes         TEXT,
  source        TEXT,                        -- manual | gmail | import
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS ix_invoices_project ON invoices(project_id);
