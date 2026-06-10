// OpenPhone — alternative company-line feed (key-based, no OAuth). Lands in the same
// comms_log as Twilio with the same sub/crew matching, so the phone vendor is swappable.
import { db } from "@/lib/db";
import { ensureComms, phoneBook, last10 } from "@/lib/twilio";

const API = "https://api.openphone.com/v1";

export function openphoneConfigured(): boolean {
  return Boolean(process.env.OPENPHONE_API_KEY);
}

function headers() {
  const key = process.env.OPENPHONE_API_KEY;
  if (!key) throw new Error("OpenPhone is not configured (OPENPHONE_API_KEY).");
  return { Authorization: key };
}

export interface OpenPhoneSyncResult {
  messages: number;
  calls: number;
  matched: number;
}

export async function syncOpenPhone(): Promise<OpenPhoneSyncResult> {
  await ensureComms();
  const book = await phoneBook();
  const h = headers();
  const now = new Date().toISOString();
  let messages = 0, calls = 0, matched = 0;

  const nums = (await (await fetch(`${API}/phone-numbers`, { headers: h })).json()) as {
    data?: { id: string; number: string }[];
  };
  if (!nums.data?.length) throw new Error("OpenPhone returned no phone numbers for this key.");

  const upsert = async (sid: string, kind: string, dirIn: boolean, other: string, body: string, at: string) => {
    const hit = book.get(last10(other));
    if (hit) matched++;
    await db.execute({
      sql: `INSERT INTO comms_log (sid, kind, direction, other_party, body, at, entity_type, entity_id, entity_label, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sid) DO UPDATE SET entity_type = excluded.entity_type, entity_id = excluded.entity_id,
              entity_label = excluded.entity_label, synced_at = excluded.synced_at`,
      args: [`op_${sid}`, kind, dirIn ? "in" : "out", other, body.slice(0, 500), at, hit?.type ?? null, hit?.id ?? null, hit?.label ?? null, now],
    });
  };

  for (const num of nums.data) {
    const msgs = (await (
      await fetch(`${API}/messages?phoneNumberId=${num.id}&maxResults=100`, { headers: h })
    ).json()) as { data?: { id: string; direction: string; from: string; to: string[]; text: string; createdAt: string }[] };
    for (const m of msgs.data ?? []) {
      messages++;
      const dirIn = m.direction === "incoming";
      await upsert(m.id, "sms", dirIn, dirIn ? m.from : (m.to?.[0] ?? ""), m.text ?? "", m.createdAt ?? "");
    }
    const callRes = (await (
      await fetch(`${API}/calls?phoneNumberId=${num.id}&maxResults=100`, { headers: h })
    ).json()) as { data?: { id: string; direction: string; participants: string[]; duration: number; createdAt: string }[] };
    for (const c of callRes.data ?? []) {
      calls++;
      const dirIn = c.direction === "incoming";
      const other = (c.participants ?? []).find((p) => last10(p) !== last10(num.number)) ?? "";
      await upsert(c.id, "call", dirIn, other, `${c.duration ?? 0}s call`, c.createdAt ?? "");
    }
  }
  return { messages, calls, matched };
}
