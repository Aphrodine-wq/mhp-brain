import { db } from "@/lib/db";
import { decrypt, encrypt } from "./crypto";
import type { ProviderId } from "./providers";

// One stored connection per (provider, account):
//   quickbooks -> account is the QB realmId (company);  gmail -> account is the dedicated box address.
export interface Connection {
  provider: ProviderId;
  account: string;
  realmId: string | null; // QB company id; null for gmail
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO; when the access token dies
  scope: string;
}

export async function saveConnection(c: Connection): Promise<void> {
  await db.execute({
    sql: `INSERT INTO oauth_connections
            (provider, account, realm_id, access_enc, refresh_enc, expires_at, scope, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now()::text, now()::text)
          ON CONFLICT(provider, account) DO UPDATE SET
            realm_id    = excluded.realm_id,
            access_enc  = excluded.access_enc,
            refresh_enc = excluded.refresh_enc,
            expires_at  = excluded.expires_at,
            scope       = excluded.scope,
            updated_at  = now()::text`,
    args: [
      c.provider, c.account, c.realmId,
      encrypt(c.accessToken), encrypt(c.refreshToken), // tokens NEVER hit the row in clear
      c.expiresAt, c.scope,
    ],
  });
  await audit(c.provider, c.account, "save", `expires_at=${c.expiresAt}`);
}

export async function loadConnection(provider: ProviderId, account: string): Promise<Connection | null> {
  const row = (
    await db.execute({
      sql: `SELECT provider, account, realm_id, access_enc, refresh_enc, expires_at, scope
              FROM oauth_connections WHERE provider = ? AND account = ?`,
      args: [provider, account],
    })
  ).rows[0];
  if (!row) return null;
  return {
    provider: row.provider as ProviderId,
    account: String(row.account),
    realmId: row.realm_id === null ? null : String(row.realm_id),
    accessToken: decrypt(String(row.access_enc)),
    refreshToken: decrypt(String(row.refresh_enc)),
    expiresAt: String(row.expires_at),
    scope: String(row.scope),
  };
}

// Token lifecycle goes to the existing app audit_log (entity_type='oauth'), so the provenance trail
// the QB spec promises starts at the connection, not just at the data pulls.
export async function audit(provider: string, account: string, action: string, detail: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO audit_log (ts, actor, entity_type, entity_id, entity_label, field, old_value, new_value, action)
          VALUES (now()::text, 'oauth', 'oauth', ?, ?, 'token', NULL, ?, ?)`,
    args: [`${provider}:${account}`, provider, detail, action],
  });
}

// Connection status for the Settings UI — provider/account/expiry only, never the tokens.
export async function listConnections(): Promise<{ provider: string; account: string; expiresAt: string }[]> {
  const rows = (
    await db.execute(`SELECT provider, account, expires_at FROM oauth_connections ORDER BY provider`)
  ).rows;
  return rows.map((r) => ({
    provider: String(r.provider),
    account: String(r.account),
    expiresAt: String(r.expires_at),
  }));
}
