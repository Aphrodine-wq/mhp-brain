// CompanyCam — jobsite photos tied to jobs. OAuth2 (generic flow), read-only. Sync pulls
// CompanyCam projects, matches them to brain projects by name, and stores photo counts +
// gallery links so project pages show the visual record.
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/oauth";
import { matchProject } from "@/lib/match-project";

const API = "https://api.companycam.com/v2";
const CC_ACCOUNT = "default";

async function ensureCc() {
  await db.execute(`CREATE TABLE IF NOT EXISTS companycam_projects (
    cc_id TEXT PRIMARY KEY,
    name TEXT,
    photo_count INTEGER DEFAULT 0,
    gallery_url TEXT,
    last_photo_at TEXT,
    project_id TEXT,
    synced_at TEXT
  )`);
}

export interface CompanyCamSyncResult {
  projects: number;
  matched: number;
  photos: number;
}

export async function syncCompanyCam(): Promise<CompanyCamSyncResult> {
  const token = await getValidAccessToken("companycam", CC_ACCOUNT);
  await ensureCc();
  const headers = { Authorization: `Bearer ${token}` };

  const projects = (await db.execute("SELECT id, name FROM projects")).rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  let page = 1, count = 0, matched = 0, photos = 0;
  const now = new Date().toISOString();
  for (;;) {
    const res = await fetch(`${API}/projects?per_page=50&page=${page}`, { headers });
    if (!res.ok) throw new Error(`CompanyCam projects failed: ${res.status}`);
    const batch = (await res.json()) as { id: string; name: string; photo_count?: number; public_url?: string; updated_at?: string }[];
    if (!batch.length) break;
    for (const cp of batch) {
      count++;
      photos += cp.photo_count ?? 0;
      const m = matchProject(projects, cp.name ?? "");
      if (m) matched++;
      await db.execute({
        sql: `INSERT INTO companycam_projects (cc_id, name, photo_count, gallery_url, last_photo_at, project_id, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(cc_id) DO UPDATE SET name = excluded.name, photo_count = excluded.photo_count,
                gallery_url = excluded.gallery_url, last_photo_at = excluded.last_photo_at,
                project_id = excluded.project_id, synced_at = excluded.synced_at`,
        args: [String(cp.id), cp.name ?? "", cp.photo_count ?? 0, cp.public_url ?? "", cp.updated_at ?? "", m?.id ?? null, now],
      });
    }
    if (batch.length < 50) break;
    page++;
  }
  return { projects: count, matched, photos };
}

export interface CcProjectRow {
  name: string;
  photoCount: number;
  galleryUrl: string;
  lastPhotoAt: string;
}

export async function ccForProject(projectId: string): Promise<CcProjectRow[]> {
  await ensureCc();
  const rows = (
    await db.execute({
      sql: "SELECT name, photo_count, gallery_url, last_photo_at FROM companycam_projects WHERE project_id = ? ORDER BY last_photo_at DESC",
      args: [projectId],
    })
  ).rows;
  return rows.map((r) => ({
    name: String(r.name ?? ""),
    photoCount: Number(r.photo_count ?? 0),
    galleryUrl: String(r.gallery_url ?? ""),
    lastPhotoAt: String(r.last_photo_at ?? "").slice(0, 10),
  }));
}
