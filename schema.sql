-- MHP Estimate Brain — Layer 0 data contract (the spine)
-- SQLite (stdlib) for the de-risk POC. Every layer reads/writes through this.

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,   -- slug of project folder name
    name        TEXT NOT NULL,
    type        TEXT,               -- from Project_Index.csv (kitchen, etc.)
    market      TEXT,               -- Oxford / Pickwick / unknown
    status      TEXT                -- Active / Dead
);

CREATE TABLE IF NOT EXISTS estimates (
    id              TEXT PRIMARY KEY,   -- slug of source file
    project_id      TEXT REFERENCES projects(id),
    source_file     TEXT NOT NULL,
    source_type     TEXT,               -- xlsx
    sheet           TEXT,               -- which sheet we read
    line_item_count INTEGER,
    sum_item_total  REAL,               -- Σ Item Total (pre-markup)
    sum_sov_total   REAL,               -- Σ SOV Total (marked-up sell = the bid)
    stated_total    REAL,               -- labeled grand total if found, else NULL
    parse_confidence TEXT,              -- CLEAN / FLAGGED / FAILED
    flags           TEXT                -- comma list: PHASE_ONLY,SUM_MISMATCH,...
);

CREATE TABLE IF NOT EXISTS line_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id TEXT REFERENCES estimates(id),
    division    TEXT,               -- CSI division header (category)
    item_no     TEXT,               -- CSI code
    description TEXT,
    qty         REAL,
    unit        TEXT,
    unit_price  REAL,
    material    REAL,
    labor       REAL,
    sub_bid     REAL,
    item_total  REAL,
    sov_total   REAL,               -- marked-up sell for this line
    sub_name    TEXT
);

CREATE TABLE IF NOT EXISTS actuals (
    project_id    TEXT REFERENCES projects(id),
    source_file   TEXT,
    closing_total REAL
);
