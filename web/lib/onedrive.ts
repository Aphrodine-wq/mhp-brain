// OneDrive document sync — rides the existing Microsoft connection (Files.Read.All is
// already in the consent). Walks the drive with Graph delta queries (first run = full
// crawl, every run after only sees changes), pulls business paperwork into the documents
// store, and matches files to projects by name. Photos and junk stay out by rule.
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/oauth";
import { saveDocument, documentExistsByRef, MAX_DOC_BYTES } from "@/lib/documents-store";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MS_ACCOUNT = process.env.MS_TENANT_ID ?? "common";

interface DriveItem {
  id: string;
  name: string;
  size: number;
  file?: { mimeType: string };
  deleted?: object;
  parentReference?: { path?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

// filename -> category. Documents only — a doc-extension is required, and images count
// only when the name clearly says paperwork (the drive is 90% jobsite photos).
const DOC_EXT = /\.(pdf|docx?|xlsx)$/i;
const IMG_EXT = /\.(jpe?g|png|heic)$/i;
function categorize(name: string): string | null {
  const n = name.toLowerCase();
  if (/w-?9/.test(n)) return "W-9";
  if (/w-?4/.test(n)) return "W-4";
  if (/certificate of liability|liability insurance|\bcoi\b/.test(n)) return "Insurance (COI)";
  if (/permit/.test(n)) return "Permit";
  if (/contract|agreement|docusign|binder/.test(n)) return "Contract";
  if (/\bplans?\b|blueprint|architect/.test(n)) return "Plan";
  // estimates belong to the estimate pipeline (estimate_files), not the documents store
  if (/estimat/.test(n)) return null;
  if (DOC_EXT.test(n)) return "Other";
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set([
  "project", "projects", "house", "home", "build", "building", "master", "file", "docs", "construction",
  "porch", "room", "remodel", "renovation", "repair", "improvement", "addition", "garage", "kitchen",
  "bathroom", "deck", "wall", "retaining", "bonus", "custom", "guest", "the", "and", "mhp", "prime",
  "complete", "with", "docusign", "contract", "permit", "plan", "sign", "active", "dead",
]);

function matchProject(
  projects: { id: string; name: string }[],
  haystack: string,
): { id: string; name: string } | null {
  const hayTokens = new Set(norm(haystack).split(" "));
  let best: { id: string; name: string; hits: number; score: number } | null = null;
  for (const p of projects) {
    const tokens = norm(p.name).split(" ").filter((t) => t.length > 3 && !STOP.has(t));
    if (!tokens.length) continue;
    const hits = tokens.filter((t) => hayTokens.has(t)).length;
    const score = hits / tokens.length;
    if (hits >= 1 && score >= 0.5 && (!best || hits > best.hits || (hits === best.hits && score > best.score))) {
      best = { id: p.id, name: p.name, hits, score };
    }
  }
  return best;
}

async function ensureState() {
  await db.execute(`CREATE TABLE IF NOT EXISTS onedrive_sync_state (
    scope TEXT PRIMARY KEY,
    delta_link TEXT,
    last_sync_at TEXT
  )`);
}

export interface OneDriveSyncResult {
  scanned: number;
  imported: number;
  skipped: number;
  files: string[];
}

export async function syncOneDrive(): Promise<OneDriveSyncResult> {
  const token = await getValidAccessToken("microsoft", MS_ACCOUNT);
  await ensureState();

  const stateRow = (
    await db.execute({ sql: "SELECT delta_link FROM onedrive_sync_state WHERE scope = ?", args: ["root"] })
  ).rows[0];

  const projects = (await db.execute("SELECT id, name FROM projects")).rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  let url = stateRow?.delta_link
    ? String(stateRow.delta_link)
    : `${GRAPH}/me/drive/root/delta?$select=id,name,size,file,deleted,parentReference&$top=200`;
  let deltaLink: string | undefined;
  let scanned = 0, imported = 0, skipped = 0;
  const files: string[] = [];

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Graph delta failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
    const data = (await res.json()) as {
      value: DriveItem[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };

    for (const item of data.value) {
      if (!item.file || item.deleted) continue;
      scanned++;
      const name = item.name ?? "";
      const isDoc = DOC_EXT.test(name);
      const isImg = IMG_EXT.test(name);
      if (!isDoc && !isImg) { skipped++; continue; }
      const category = categorize(name);
      if (!category || (isImg && category === "Other")) { skipped++; continue; }
      if (item.size > MAX_DOC_BYTES) { skipped++; continue; }
      const ref = `onedrive:${item.id}`;
      if (await documentExistsByRef(ref)) { skipped++; continue; }

      // fetch content via the item's download endpoint
      const dl = await fetch(`${GRAPH}/me/drive/items/${item.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dl.ok) { skipped++; continue; }
      const content = Buffer.from(await dl.arrayBuffer());

      const folder = (item.parentReference?.path ?? "").split("/").pop() ?? "";
      const m = matchProject(projects, `${folder} ${name}`);
      await saveDocument({
        category,
        entityType: m ? "project" : null,
        entityId: m?.id ?? null,
        entityLabel: m?.name ?? (decodeURIComponent(folder) || null),
        filename: name.replace(/["\r\n]/g, "").slice(0, 200),
        mime: item.file.mimeType ?? null,
        content,
        uploadedBy: "OneDrive sync",
        sourceRef: ref,
      });
      imported++;
      if (files.length < 25) files.push(name);
    }

    deltaLink = data["@odata.deltaLink"];
    url = data["@odata.nextLink"] ?? "";
  }

  if (deltaLink) {
    await db.execute({
      sql: `INSERT INTO onedrive_sync_state (scope, delta_link, last_sync_at)
            VALUES (?, ?, now()::text)
            ON CONFLICT(scope) DO UPDATE SET delta_link = excluded.delta_link, last_sync_at = now()::text`,
      args: ["root", deltaLink],
    });
  }

  return { scanned, imported, skipped, files };
}
