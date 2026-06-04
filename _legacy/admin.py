"""Admin write-back + audit log — turn the read-only mirror into a tool.

Every administrative edit goes through `set_override`, which does two things atomically:
  1. upserts the new value into `overrides`  (so reads can overlay it on the base data)
  2. appends a row to `audit_log`           (so there's a who/what/when trail forever)

The base tables (projects, estimates, ...) are never mutated — the parsed truth stays intact,
and corrections live as a transparent layer on top. Both tables already exist in the schema
(designed, never wired); this is the code that finally uses them.

Read pattern: load the base record, then `overlay()` the overrides for its entity type.
"""
import sqlite3
from datetime import datetime, date
from pathlib import Path

DB = Path(__file__).parent / "mhp.db"

# Fields an admin is allowed to override, per entity type. Anything else is rejected — a bid
# line total is parsed truth, not an opinion; status/market/type are judgment calls.
EDITABLE = {
    "project": {"status", "market", "type"},
    "sub": {"trade", "phone"},
    "flag": {"dismissed"},          # attention-queue items the admin has cleared
}

PROJECT_STATUSES = ["Active", "Aging", "Bid", "Paused", "Likely Done", "Dead", "Unknown"]


def connect():
    return sqlite3.connect(DB)


def now():
    return datetime.now().isoformat(timespec="seconds")


def today_month():
    return date.today().strftime("%Y-%m")


def ensure_tables(con):
    """Defensive — both exist in the shipped schema, but keep admin self-sufficient."""
    con.executescript("""
        CREATE TABLE IF NOT EXISTS overrides (
          entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field TEXT NOT NULL,
          value TEXT, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (entity_type, entity_id, field));
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
          entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, entity_label TEXT,
          field TEXT NOT NULL, old_value TEXT, new_value TEXT, action TEXT NOT NULL DEFAULT 'set');
        CREATE INDEX IF NOT EXISTS ix_overrides_lookup ON overrides(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts DESC);
    """)


def current_value(con, entity_type, entity_id, field):
    """The value an edit is replacing — an existing override if present, else the base column,
    so the audit trail records the real before-state."""
    row = con.execute("SELECT value FROM overrides WHERE entity_type=? AND entity_id=? AND field=?",
                      (entity_type, entity_id, field)).fetchone()
    if row:
        return row[0]
    if entity_type == "project" and field in {"status", "market", "type"}:
        r = con.execute(f"SELECT {field} FROM projects WHERE id=?", (entity_id,)).fetchone()
        return r[0] if r else None
    if entity_type == "sub" and field in {"trade", "phone"}:
        r = con.execute(f"SELECT {field} FROM subs WHERE name=?", (entity_id,)).fetchone()
        return r[0] if r else None
    return None


def label_for(con, entity_type, entity_id):
    """Point-in-time name snapshot so audit history reads even if the entity is renamed."""
    if entity_type == "project":
        r = con.execute("SELECT name FROM projects WHERE id=?", (entity_id,)).fetchone()
        return r[0] if r else entity_id
    return entity_id


def set_override(entity_type, entity_id, field, value, actor="Walt Burge"):
    """Apply one admin edit. Returns {ok, old, new} or {ok:False, error}."""
    if entity_type not in EDITABLE or field not in EDITABLE[entity_type]:
        return {"ok": False, "error": f"{entity_type}.{field} is not editable"}
    if entity_type == "project" and field == "status" and value not in PROJECT_STATUSES:
        return {"ok": False, "error": f"invalid status '{value}'"}
    con = connect()
    ensure_tables(con)
    old = current_value(con, entity_type, entity_id, field)
    if (old or "") == (value or ""):
        con.close()
        return {"ok": True, "old": old, "new": value, "noop": True}
    label = label_for(con, entity_type, entity_id)
    ts = now()
    con.execute("""INSERT INTO overrides(entity_type,entity_id,field,value,updated_by,updated_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(entity_type,entity_id,field) DO UPDATE SET value=excluded.value,
            updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
        (entity_type, entity_id, field, value, actor, ts))
    con.execute("""INSERT INTO audit_log(ts,actor,entity_type,entity_id,entity_label,field,
        old_value,new_value,action) VALUES(?,?,?,?,?,?,?,?,?)""",
        (ts, actor, entity_type, entity_id, label, field, old, value, "set"))
    con.commit()
    con.close()
    return {"ok": True, "old": old, "new": value}


def overlay(con, entity_type):
    """Return {(entity_id, field): value} of all overrides for an entity type, for read overlay."""
    out = {}
    for eid, field, val in con.execute(
            "SELECT entity_id, field, value FROM overrides WHERE entity_type=?", (entity_type,)):
        out[(eid, field)] = val
    return out


def dismissed_flags(con):
    """Set of flag ids the admin has cleared from the attention queue."""
    return {eid for (eid,) in con.execute(
        "SELECT entity_id FROM overrides WHERE entity_type='flag' AND field='dismissed' AND value='true'")}


def recent_audit(limit=40):
    con = connect()
    ensure_tables(con)
    rows = con.execute("""SELECT ts,actor,entity_type,entity_label,field,old_value,new_value,action
        FROM audit_log ORDER BY ts DESC, id DESC LIMIT ?""", (limit,)).fetchall()
    con.close()
    return [{"ts": ts, "actor": a, "entity_type": et, "label": lbl, "field": f,
             "old": ov, "new": nv, "action": act}
            for ts, a, et, lbl, f, ov, nv, act in rows]
