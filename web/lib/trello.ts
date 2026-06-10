// Trello — MHP's project-management board. Not OAuth2: a public API key (env) plus a
// user-granted member token (read-only, never expires) captured by /integrations/trello.
// Sync pulls every open card, matches cards to brain projects by name, and stores them
// app-side so project pages can show where each job sits on the board.
import { db } from "@/lib/db";
import { loadConnection } from "@/lib/oauth/store";

const API = "https://api.trello.com/1";

export function trelloKey(): string {
  const k = process.env.TRELLO_API_KEY;
  if (!k) throw new Error("Missing env TRELLO_API_KEY");
  return k;
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set([
  "project", "projects", "house", "home", "build", "building", "master", "file", "docs", "construction",
  "porch", "room", "remodel", "renovation", "repair", "improvement", "addition", "garage", "kitchen",
  "bathroom", "deck", "wall", "retaining", "bonus", "custom", "guest", "the", "and", "mhp", "prime",
]);

function matchProject(projects: { id: string; name: string }[], cardName: string): string | null {
  const hayTokens = new Set(norm(cardName).split(" "));
  let best: { id: string; hits: number; score: number } | null = null;
  for (const p of projects) {
    const tokens = norm(p.name).split(" ").filter((t) => t.length > 3 && !STOP.has(t));
    if (!tokens.length) continue;
    const hits = tokens.filter((t) => hayTokens.has(t)).length;
    const score = hits / tokens.length;
    if (hits >= 1 && score >= 0.5 && (!best || hits > best.hits || (hits === best.hits && score > best.score))) {
      best = { id: p.id, hits, score };
    }
  }
  return best?.id ?? null;
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

  const boards = (await (
    await fetch(`${API}/members/me/boards?key=${key}&token=${token}&filter=open&fields=name`)
  ).json()) as { id: string; name: string }[];

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
      const projectId = matchProject(projects, c.name);
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
