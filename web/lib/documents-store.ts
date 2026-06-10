// Document storage — W-9s, insurance certificates, contracts, and anything else worth
// keeping per sub or project. Bytes live in the app's own private Postgres (BYTEA),
// exactly like estimate_files: auth-gated download, never public storage.
import { randomUUID } from "crypto";
import { db } from "./db";

export { DOC_CATEGORIES, type DocCategory } from "./doc-categories";

export const MAX_DOC_BYTES = 15 * 1024 * 1024; // 15MB — plenty for scanned PDFs

export interface DocMeta {
  id: string;
  category: string;
  entityType: string | null; // 'sub' | 'project' | null (general)
  entityId: string | null;
  entityLabel: string | null;
  filename: string;
  mime: string | null;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string;
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    entity_label TEXT,
    filename TEXT NOT NULL,
    mime TEXT,
    size_bytes INTEGER NOT NULL,
    content BYTEA NOT NULL,
    uploaded_by TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now()
  )`);
  ensured = true;
}

const toMeta = (r: Record<string, unknown>): DocMeta => ({
  id: String(r.id),
  category: String(r.category),
  entityType: (r.entity_type as string | null) ?? null,
  entityId: (r.entity_id as string | null) ?? null,
  entityLabel: (r.entity_label as string | null) ?? null,
  filename: String(r.filename),
  mime: (r.mime as string | null) ?? null,
  sizeBytes: Number(r.size_bytes ?? 0),
  uploadedBy: (r.uploaded_by as string | null) ?? null,
  uploadedAt: isoDay(r.uploaded_at),
});

// pg returns timestamptz as a Date object; normalize either shape to YYYY-MM-DD
function isoDay(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}

export async function saveDocument(d: {
  category: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  filename: string;
  mime?: string | null;
  content: Buffer;
  uploadedBy: string;
}): Promise<string> {
  await ensure();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO documents (id, category, entity_type, entity_id, entity_label, filename, mime, size_bytes, content, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      d.category,
      d.entityType ?? null,
      d.entityId ?? null,
      d.entityLabel ?? null,
      d.filename,
      d.mime ?? null,
      d.content.length,
      d.content,
      d.uploadedBy,
    ],
  });
  return id;
}

export async function listDocuments(filter?: { entityType?: string; entityId?: string }): Promise<DocMeta[]> {
  await ensure();
  const where = filter?.entityType ? " WHERE entity_type = ? AND entity_id = ?" : "";
  const args = filter?.entityType ? [filter.entityType, filter.entityId ?? ""] : [];
  const rows = (
    await db.execute({
      sql: `SELECT id, category, entity_type, entity_id, entity_label, filename, mime, size_bytes, uploaded_by, uploaded_at
            FROM documents${where} ORDER BY uploaded_at DESC`,
      args,
    })
  ).rows;
  return rows.map(toMeta);
}

export async function getDocument(id: string): Promise<{ meta: DocMeta; content: Buffer } | null> {
  await ensure();
  const r = (await db.execute({ sql: "SELECT * FROM documents WHERE id = ?", args: [id] })).rows[0];
  if (!r) return null;
  return { meta: toMeta(r), content: r.content as Buffer };
}

export async function deleteDocument(id: string): Promise<boolean> {
  await ensure();
  const r = await db.execute({ sql: "DELETE FROM documents WHERE id = ? RETURNING id", args: [id] });
  return r.rows.length > 0;
}
