// Per-integration knobs, stored app-side (provider+key → value). Each sync reads its own.
import { db } from "@/lib/db";

let ensured = false;
async function ensure() {
  if (ensured) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS integration_settings (
    provider TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (provider, key)
  )`);
  ensured = true;
}

export async function getSetting(provider: string, key: string, fallback: string): Promise<string> {
  await ensure();
  const r = (
    await db.execute({ sql: "SELECT value FROM integration_settings WHERE provider = ? AND key = ?", args: [provider, key] })
  ).rows[0];
  return r?.value == null ? fallback : String(r.value);
}

export async function setSetting(provider: string, key: string, value: string): Promise<void> {
  await ensure();
  await db.execute({
    sql: `INSERT INTO integration_settings (provider, key, value) VALUES (?, ?, ?)
          ON CONFLICT(provider, key) DO UPDATE SET value = excluded.value`,
    args: [provider, key, value.slice(0, 200)],
  });
}

export async function allSettings(): Promise<Record<string, Record<string, string>>> {
  await ensure();
  const rows = (await db.execute("SELECT provider, key, value FROM integration_settings")).rows;
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const p = String(r.provider);
    (out[p] ??= {})[String(r.key)] = String(r.value ?? "");
  }
  return out;
}
