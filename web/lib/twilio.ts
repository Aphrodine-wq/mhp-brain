// Twilio — the company phone line's memory. Pulls SMS and call logs (read-only REST,
// account SID + auth token from env) and matches numbers to subs and crew so their
// detail pages show recent comms. Client numbers will match too once projects carry them.
import { db } from "@/lib/db";

const TW = "https://api.twilio.com/2010-04-01";

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

function auth(): { sid: string; header: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  return { sid, header: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}` };
}

// last 10 digits — US numbers compare reliably regardless of +1 / formatting
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

async function ensureComms() {
  await db.execute(`CREATE TABLE IF NOT EXISTS comms_log (
    sid TEXT PRIMARY KEY,
    kind TEXT,            -- 'sms' | 'call'
    direction TEXT,
    other_party TEXT,     -- the non-MHP number
    body TEXT,            -- sms body; call duration note for calls
    at TEXT,
    entity_type TEXT,     -- 'sub' | 'crew' | null
    entity_id TEXT,
    entity_label TEXT,
    synced_at TEXT
  )`);
}

interface PhoneBookEntry {
  type: "sub" | "crew";
  id: string;
  label: string;
}

async function phoneBook(): Promise<Map<string, PhoneBookEntry>> {
  const book = new Map<string, PhoneBookEntry>();
  // overrides may hold corrected numbers; subsList/crewList logic lives in queries — keep
  // this lean and read the base tables plus the overrides overlay directly.
  const subs = (await db.execute("SELECT name, phone FROM subs WHERE phone IS NOT NULL AND phone != ''")).rows;
  for (const r of subs) {
    const k = last10(String(r.phone));
    if (k.length === 10) book.set(k, { type: "sub", id: String(r.name).replace(/\s+/g, " ").trim().toLowerCase(), label: String(r.name) });
  }
  const crew = (await db.execute("SELECT name, phone FROM crew WHERE phone IS NOT NULL AND phone != ''")).rows;
  for (const r of crew) {
    const k = last10(String(r.phone));
    if (k.length === 10) book.set(k, { type: "crew", id: String(r.name).replace(/\s+/g, " ").trim().toLowerCase(), label: String(r.name) });
  }
  return book;
}

export interface TwilioSyncResult {
  messages: number;
  calls: number;
  matched: number;
}

export async function syncTwilio(): Promise<TwilioSyncResult> {
  const { sid, header } = auth();
  await ensureComms();
  const book = await phoneBook();
  const now = new Date().toISOString();
  let messages = 0, calls = 0, matched = 0;

  const upsert = async (row: {
    sid: string; kind: string; direction: string; other: string; body: string; at: string;
  }) => {
    const hit = book.get(last10(row.other));
    if (hit) matched++;
    await db.execute({
      sql: `INSERT INTO comms_log (sid, kind, direction, other_party, body, at, entity_type, entity_id, entity_label, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sid) DO UPDATE SET entity_type = excluded.entity_type, entity_id = excluded.entity_id,
              entity_label = excluded.entity_label, synced_at = excluded.synced_at`,
      args: [row.sid, row.kind, row.direction, row.other, row.body.slice(0, 500), row.at, hit?.type ?? null, hit?.id ?? null, hit?.label ?? null, now],
    });
  };

  const msgs = (await (
    await fetch(`${TW}/Accounts/${sid}/Messages.json?PageSize=200`, { headers: { Authorization: header } })
  ).json()) as { messages?: { sid: string; direction: string; from: string; to: string; body: string; date_sent: string }[] };
  for (const m of msgs.messages ?? []) {
    messages++;
    const inbound = m.direction.startsWith("inbound");
    await upsert({ sid: m.sid, kind: "sms", direction: inbound ? "in" : "out", other: inbound ? m.from : m.to, body: m.body ?? "", at: m.date_sent ?? "" });
  }

  const callRes = (await (
    await fetch(`${TW}/Accounts/${sid}/Calls.json?PageSize=200`, { headers: { Authorization: header } })
  ).json()) as { calls?: { sid: string; direction: string; from: string; to: string; duration: string; start_time: string }[] };
  for (const c of callRes.calls ?? []) {
    calls++;
    const inbound = c.direction.startsWith("inbound");
    await upsert({ sid: c.sid, kind: "call", direction: inbound ? "in" : "out", other: inbound ? c.from : c.to, body: `${c.duration ?? 0}s call`, at: c.start_time ?? "" });
  }

  return { messages, calls, matched };
}

export interface CommRow {
  kind: string;
  direction: string;
  body: string;
  at: string;
}

export async function commsForEntity(entityType: string, entityId: string): Promise<CommRow[]> {
  await ensureComms();
  const rows = (
    await db.execute({
      sql: `SELECT kind, direction, body, at FROM comms_log
            WHERE entity_type = ? AND entity_id = ? ORDER BY at DESC LIMIT 10`,
      args: [entityType, entityId],
    })
  ).rows;
  return rows.map((r) => ({
    kind: String(r.kind), direction: String(r.direction), body: String(r.body ?? ""), at: String(r.at ?? "").slice(0, 16).replace("T", " "),
  }));
}
