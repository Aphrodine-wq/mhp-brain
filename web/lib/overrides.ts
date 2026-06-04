import { db } from "./db";
import { canon } from "./canon";

// The corrections layer. Overrides live in their own table (never dropped by the pipeline) and
// are applied as a read-time overlay. Every write also appends an immutable audit_log row.

export type EntityType = "project" | "sub" | "estimate" | "live_flag";

// Server-side allow-list: which fields can be set per entity, and (where enumerable) the legal values.
const ALLOWED: Record<EntityType, Record<string, Set<string> | null>> = {
  project: { status: new Set(["Active", "Aging", "Bid", "Paused", "Likely Done", "Dead", "Unknown"]), market: null, type: null },
  sub: { trade: null, phone: null, verified: new Set(["true", "false"]) },
  live_flag: { dismissed: new Set(["true", "false"]) },
  estimate: { project_id: null },
};

export type OverrideMap = Map<string, Record<string, string | null>>;

export async function loadOverrides(entityType: EntityType): Promise<OverrideMap> {
  const out: OverrideMap = new Map();
  const r = await db.execute({ sql: "SELECT entity_id, field, value FROM overrides WHERE entity_type=?", args: [entityType] });
  for (const row of r.rows) {
    const eid = String(row.entity_id);
    if (!out.has(eid)) out.set(eid, {});
    out.get(eid)![String(row.field)] = row.value as string | null;
  }
  return out;
}

// Sub override key — normalized name, matching refine.ckey() (whitespace-collapsed, lowercased).
export const subKey = (name: string): string => canon(name);

export class OverrideError extends Error {}

export async function writeOverride(opts: {
  entityType: EntityType;
  entityId: string;
  field: string;
  value: string | null;
  actor: string;
  label?: string | null;
  action?: string;
}): Promise<void> {
  const { entityType, entityId, field, value, actor } = opts;
  const fields = ALLOWED[entityType];
  if (!fields || !(field in fields)) throw new OverrideError(`bad field ${entityType}.${field}`);
  const legal = fields[field];
  if (legal && (value == null || !legal.has(value))) throw new OverrideError(`bad value for ${field}`);
  if (value != null && value.length > 200) throw new OverrideError("value too long");
  if (!entityId) throw new OverrideError("missing entity id");

  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  try {
    const old = await tx.execute({
      sql: "SELECT value FROM overrides WHERE entity_type=? AND entity_id=? AND field=?",
      args: [entityType, entityId, field],
    });
    const oldVal = old.rows.length ? (old.rows[0].value as string | null) : null;
    await tx.execute({
      sql: `INSERT INTO overrides(entity_type,entity_id,field,value,updated_by,updated_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(entity_type,entity_id,field)
            DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
      args: [entityType, entityId, field, value, actor, now],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log(ts,actor,entity_type,entity_id,entity_label,field,old_value,new_value,action)
            VALUES(?,?,?,?,?,?,?,?,?)`,
      args: [now, actor, entityType, entityId, opts.label ?? null, field, oldVal, value, opts.action ?? "set"],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export interface AuditRow {
  ts: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  field: string;
  old: string | null;
  new: string | null;
  action: string;
}

export async function auditList(limit = 500): Promise<AuditRow[]> {
  const r = await db.execute({
    sql: `SELECT ts,actor,entity_type,entity_id,entity_label,field,old_value,new_value,action
          FROM audit_log ORDER BY ts DESC, id DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((x) => ({
    ts: String(x.ts),
    actor: String(x.actor),
    entity_type: String(x.entity_type),
    entity_id: String(x.entity_id),
    label: x.entity_label as string | null,
    field: String(x.field),
    old: x.old_value as string | null,
    new: x.new_value as string | null,
    action: String(x.action),
  }));
}
