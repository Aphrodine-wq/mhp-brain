// DocuSign — MHP's contracts already live here. Pulls envelope statuses (sent /
// delivered / completed) per project and auto-files every completed envelope's signed
// PDF into the documents store. Read-only: we never send envelopes from the brain.
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/oauth";
import { saveDocument, documentExistsByRef } from "@/lib/documents-store";
import { matchProject } from "@/lib/match-project";

const DS_ACCOUNT = "default"; // single-company connection key (see oauth start route)

interface DsUserInfo {
  accounts: { account_id: string; is_default: boolean; base_uri: string }[];
}

async function dsContext(): Promise<{ token: string; accountId: string; base: string }> {
  const token = await getValidAccessToken("docusign", DS_ACCOUNT);
  const authBase = process.env.DS_AUTH_BASE ?? "https://account.docusign.com";
  const res = await fetch(`${authBase}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`DocuSign userinfo failed: ${res.status}`);
  const info = (await res.json()) as DsUserInfo;
  const acct = info.accounts.find((a) => a.is_default) ?? info.accounts[0];
  if (!acct) throw new Error("DocuSign returned no accounts.");
  return { token, accountId: acct.account_id, base: `${acct.base_uri}/restapi/v2.1/accounts/${acct.account_id}` };
}

async function ensureEnvelopes() {
  await db.execute(`CREATE TABLE IF NOT EXISTS docusign_envelopes (
    envelope_id TEXT PRIMARY KEY,
    subject TEXT,
    status TEXT,
    sent_at TEXT,
    completed_at TEXT,
    project_id TEXT,
    synced_at TEXT
  )`);
}

export interface DocusignSyncResult {
  envelopes: number;
  filed: number;
  matched: number;
}

export async function syncDocusign(): Promise<DocusignSyncResult> {
  const { token, base } = await dsContext();
  await ensureEnvelopes();

  const projects = (await db.execute("SELECT id, name FROM projects")).rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  // last 12 months of envelopes, every status — the brain should know what's out for signature
  const from = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const res = await fetch(`${base}/envelopes?from_date=${encodeURIComponent(from)}&status=any&count=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DocuSign envelopes failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    envelopes?: { envelopeId: string; emailSubject: string; status: string; sentDateTime?: string; completedDateTime?: string }[];
  };

  const now = new Date().toISOString();
  let envelopes = 0, filed = 0, matched = 0;
  for (const ev of data.envelopes ?? []) {
    envelopes++;
    const m = matchProject(projects, ev.emailSubject ?? "");
    if (m) matched++;
    await db.execute({
      sql: `INSERT INTO docusign_envelopes (envelope_id, subject, status, sent_at, completed_at, project_id, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(envelope_id) DO UPDATE SET subject = excluded.subject, status = excluded.status,
              sent_at = excluded.sent_at, completed_at = excluded.completed_at,
              project_id = excluded.project_id, synced_at = excluded.synced_at`,
      args: [ev.envelopeId, ev.emailSubject ?? "", ev.status ?? "", ev.sentDateTime ?? "", ev.completedDateTime ?? "", m?.id ?? null, now],
    });

    // auto-file the signed PDF once, on completion
    if (ev.status === "completed") {
      const ref = `docusign:${ev.envelopeId}`;
      if (await documentExistsByRef(ref)) continue;
      const dl = await fetch(`${base}/envelopes/${ev.envelopeId}/documents/combined`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dl.ok) continue;
      await saveDocument({
        category: "Contract",
        entityType: m ? "project" : null,
        entityId: m?.id ?? null,
        entityLabel: m?.name ?? null,
        filename: `${(ev.emailSubject || "DocuSign envelope").replace(/["\r\n]/g, "").slice(0, 160)} — signed.pdf`,
        mime: "application/pdf",
        content: Buffer.from(await dl.arrayBuffer()),
        uploadedBy: "DocuSign sync",
        sourceRef: ref,
      });
      filed++;
    }
  }
  return { envelopes, filed, matched };
}

export interface EnvelopeRow {
  subject: string;
  status: string;
  sentAt: string;
  completedAt: string;
}

export async function envelopesForProject(projectId: string): Promise<EnvelopeRow[]> {
  await ensureEnvelopes();
  const rows = (
    await db.execute({
      sql: `SELECT subject, status, sent_at, completed_at FROM docusign_envelopes
            WHERE project_id = ? ORDER BY sent_at DESC LIMIT 10`,
      args: [projectId],
    })
  ).rows;
  return rows.map((r) => ({
    subject: String(r.subject ?? ""),
    status: String(r.status ?? ""),
    sentAt: String(r.sent_at ?? "").slice(0, 10),
    completedAt: String(r.completed_at ?? "").slice(0, 10),
  }));
}
