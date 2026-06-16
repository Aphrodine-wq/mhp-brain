// Trello — MHP's project-management board. Not OAuth2: a public API key (env) plus a
// user-granted member token (read-only, never expires) captured by /integrations/trello.
// Sync pulls every open card, matches cards to brain projects by name, and stores them
// app-side so project pages can show where each job sits on the board.
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { loadConnection } from "@/lib/oauth/store";
import { matchProject } from "@/lib/match-project";
import { getSetting } from "@/lib/integration-settings";

const API = "https://api.trello.com/1";

export function trelloKey(): string {
  const k = process.env.TRELLO_API_KEY;
  if (!k) throw new Error("Missing env TRELLO_API_KEY");
  return k;
}

// Base URL the Trello token flow returns to. CRITICAL: it must match the domain the user
// is actually on, or the token grant lands on a different host where the session cookie
// doesn't exist and /api/trello/connect 401s. So we derive it from the live request host
// first; env/Vercel/localhost are only fallbacks when no request scope is available.
export async function appBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    /* not inside a request — fall through to configured values */
  }
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

// The authorize URL the Connect button opens. Trello returns the token in the URL
// fragment of return_url, which /integrations/trello catches client-side.
export function trelloAuthorizeUrl(returnUrl: string): string {
  const p = new URLSearchParams({
    key: trelloKey(),
    name: "MHP Brain",
    scope: "read",
    expiration: "never",
    response_type: "token",
    return_url: returnUrl,
  });
  return `https://trello.com/1/authorize?${p.toString()}`;
}

export async function trelloToken(): Promise<string> {
  const accounts = (
    await db.execute({ sql: "SELECT account FROM oauth_connections WHERE provider = ?", args: ["trello"] })
  ).rows;
  if (!accounts.length) throw new Error("Trello is not connected.");
  const conn = await loadConnection("trello", String(accounts[0].account));
  if (!conn) throw new Error("Trello is not connected.");
  return conn.accessToken;
}

// True only once the member token has been granted (Connect flow on Integrations).
// isConfigured("trello") only checks the API key env — that's the lock; this is the key.
export async function trelloConnected(): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM oauth_connections WHERE provider = ? LIMIT 1",
    args: ["trello"],
  });
  return r.rows.length > 0;
}

export async function trelloMe(token: string): Promise<{ username: string; fullName: string }> {
  const res = await fetch(`${API}/members/me?key=${trelloKey()}&token=${token}&fields=username,fullName`);
  if (!res.ok) throw new Error(`Trello token check failed: ${res.status}`);
  return res.json();
}

async function ensureCards() {
  await db.execute(`CREATE TABLE IF NOT EXISTS trello_cards (
    card_id TEXT PRIMARY KEY,
    board TEXT,
    list TEXT,
    name TEXT,
    url TEXT,
    due TEXT,
    closed BOOLEAN DEFAULT FALSE,
    last_activity TEXT,
    project_id TEXT,
    synced_at TEXT
  )`);
}

export interface TrelloSyncResult {
  boards: number;
  cards: number;
  matched: number;
}

export async function syncTrello(): Promise<TrelloSyncResult> {
  const token = await trelloToken();
  const key = trelloKey();
  await ensureCards();

  // Scope to one board if configured (Integration settings → Trello board);
  // otherwise sync every open board the member can see (back-compat default).
  const boardId = (await getSetting("trello", "board_id", "")).trim();
  let boards: { id: string; name: string }[];
  if (boardId) {
    const res = await fetch(`${API}/boards/${boardId}?key=${key}&token=${token}&fields=name`);
    if (!res.ok) {
      throw new Error(
        `Trello board "${boardId}" not found — check Integration settings → Trello board (${res.status}).`,
      );
    }
    const b = (await res.json()) as { id: string; name: string };
    boards = [{ id: b.id, name: b.name }];
  } else {
    boards = (await (
      await fetch(`${API}/members/me/boards?key=${key}&token=${token}&filter=open&fields=name`)
    ).json()) as { id: string; name: string }[];
  }

  const projects = (await db.execute("SELECT id, name FROM projects")).rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  let cards = 0, matched = 0;
  const now = new Date().toISOString();
  for (const board of boards) {
    const [lists, boardCards] = await Promise.all([
      fetch(`${API}/boards/${board.id}/lists?key=${key}&token=${token}&fields=name`).then((r) => r.json()) as Promise<{ id: string; name: string }[]>,
      fetch(`${API}/boards/${board.id}/cards?key=${key}&token=${token}&fields=name,url,due,closed,idList,dateLastActivity`).then((r) => r.json()) as Promise<
        { id: string; name: string; url: string; due: string | null; closed: boolean; idList: string; dateLastActivity: string }[]
      >,
    ]);
    const listName = new Map(lists.map((l) => [l.id, l.name]));
    for (const c of boardCards) {
      const projectId = matchProject(projects, c.name)?.id ?? null;
      if (projectId) matched++;
      cards++;
      await db.execute({
        sql: `INSERT INTO trello_cards (card_id, board, list, name, url, due, closed, last_activity, project_id, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(card_id) DO UPDATE SET
                board = excluded.board, list = excluded.list, name = excluded.name, url = excluded.url,
                due = excluded.due, closed = excluded.closed, last_activity = excluded.last_activity,
                project_id = excluded.project_id, synced_at = excluded.synced_at`,
        args: [c.id, board.name, listName.get(c.idList) ?? "", c.name, c.url, c.due, c.closed, c.dateLastActivity, projectId, now],
      });
    }
  }
  return { boards: boards.length, cards, matched };
}

export interface TrelloCardRow {
  name: string;
  board: string;
  list: string;
  url: string;
  due: string | null;
  lastActivity: string;
}

export interface TrelloTabCard {
  name: string;
  list: string;
  url: string;
  due: string | null;
  lastActivity: string;
  projectId: string | null;
  projectName: string | null;
}

export interface TrelloBoardGroup {
  board: string;
  cards: TrelloTabCard[];
}

export interface TrelloTabData {
  boards: TrelloBoardGroup[];
  totalCards: number;
  matched: number;
  lastSynced: string | null;
}

// Everything the Trello tab needs in one read: open cards grouped by board, with the
// linked project (if matched) joined in, plus headline counts and the last sync time.
export async function trelloTabData(): Promise<TrelloTabData> {
  await ensureCards();
  const rows = (
    await db.execute(`SELECT c.name, c.board, c.list, c.url, c.due, c.last_activity, c.project_id,
                             c.synced_at, p.name AS project_name
                      FROM trello_cards c
                      LEFT JOIN projects p ON p.id = c.project_id
                      WHERE c.closed = FALSE
                      ORDER BY c.board ASC, c.list ASC, c.last_activity DESC`)
  ).rows;

  const byBoard = new Map<string, TrelloBoardGroup>();
  let matched = 0;
  let lastSynced: string | null = null;
  for (const r of rows) {
    const board = String(r.board ?? "—");
    if (!byBoard.has(board)) byBoard.set(board, { board, cards: [] });
    const projectId = r.project_id ? String(r.project_id) : null;
    if (projectId) matched++;
    const syncedAt = r.synced_at ? String(r.synced_at) : null;
    if (syncedAt && (!lastSynced || syncedAt > lastSynced)) lastSynced = syncedAt;
    byBoard.get(board)!.cards.push({
      name: String(r.name),
      list: String(r.list ?? ""),
      url: String(r.url ?? ""),
      due: (r.due as string | null)?.slice(0, 10) ?? null,
      lastActivity: String(r.last_activity ?? "").slice(0, 10),
      projectId,
      projectName: r.project_name ? String(r.project_name) : null,
    });
  }
  return { boards: [...byBoard.values()], totalCards: rows.length, matched, lastSynced };
}

export async function trelloCardsForProject(projectId: string): Promise<TrelloCardRow[]> {
  await ensureCards();
  const rows = (
    await db.execute({
      sql: `SELECT name, board, list, url, due, last_activity FROM trello_cards
            WHERE project_id = ? AND closed = FALSE ORDER BY last_activity DESC`,
      args: [projectId],
    })
  ).rows;
  return rows.map((r) => ({
    name: String(r.name),
    board: String(r.board ?? ""),
    list: String(r.list ?? ""),
    url: String(r.url ?? ""),
    due: (r.due as string | null)?.slice(0, 10) ?? null,
    lastActivity: String(r.last_activity ?? "").slice(0, 10),
  }));
}
