import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

// Client-portal share links — long-lived, revocable, one active per job. Mirrors the password-reset
// token model in lib/auth.ts: hand out the raw token (in the link), store only its SHA-256 hash, so
// a DB read can't be replayed. No expiry by design (the homeowner keeps it for the whole job);
// regenerating revokes the old one, and the owner can revoke anytime.

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// idempotent self-heal — matches the runtime-ensure habit (e.g. trello.ensureCards)
async function ensureTable() {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS job_share_links (
      token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, revoked_at TEXT
    )`);
  } catch { /* already present */ }
}

async function audit(action: string, projectId: string, actor: string) {
  try {
    await db.execute({
      sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
            VALUES (?, ?, 'project', ?, ?, 'share_link', NULL, NULL, ?)`,
      args: [new Date().toISOString(), actor, projectId, projectId, action],
    });
  } catch { /* audit_log absent — never block the share action */ }
}

// Mint a new link (revoking any active one first) and return the RAW token for the URL.
export async function createShareLink(projectId: string, actor: string): Promise<string> {
  await ensureTable();
  const now = new Date().toISOString();
  await db.execute({ sql: `UPDATE job_share_links SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL`, args: [now, projectId] });
  const raw = randomBytes(32).toString("base64url");
  await db.execute({
    sql: `INSERT INTO job_share_links (token_hash, project_id, created_by, created_at) VALUES (?, ?, ?, ?)`,
    args: [hashToken(raw), projectId, actor, now],
  });
  await audit("share_created", projectId, actor);
  return raw;
}

// Resolve a raw token to its project id, or null if unknown/revoked. Read-only, no consumption.
export async function resolveShareLink(raw: string): Promise<string | null> {
  if (!raw) return null;
  try {
    const row = (await db.execute({
      sql: `SELECT project_id FROM job_share_links WHERE token_hash = ? AND revoked_at IS NULL`,
      args: [hashToken(raw)],
    })).rows[0];
    return row ? String(row.project_id) : null;
  } catch {
    return null;
  }
}

export async function revokeShareLink(projectId: string, actor: string): Promise<void> {
  await ensureTable();
  await db.execute({ sql: `UPDATE job_share_links SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL`, args: [new Date().toISOString(), projectId] });
  await audit("share_revoked", projectId, actor);
}

// Is there an active link for this job? (drives the owner UI state — no token returned)
export async function hasActiveShareLink(projectId: string): Promise<boolean> {
  await ensureTable();
  try {
    const row = (await db.execute({ sql: `SELECT 1 FROM job_share_links WHERE project_id = ? AND revoked_at IS NULL LIMIT 1`, args: [projectId] })).rows[0];
    return !!row;
  } catch {
    return false;
  }
}
