// Microsoft Teams integration via Graph API. Read-only: pulls messages from channels and chats,
// matches them to brain projects, stores them for search and context surfacing.
//
// Depends on: the "microsoft" OAuth connection (lib/oauth), the teams_* tables (003_teams.sql).

import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/oauth";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MS_ACCOUNT = process.env.MS_TENANT_ID ?? "common";

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

async function graphFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

interface GraphList<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

// Page through a Graph collection, yielding all items.
async function graphListAll<T>(path: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = `${GRAPH}${path}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph ${url} → ${res.status}: ${text}`);
    }
    const data = (await res.json()) as GraphList<T>;
    items.push(...data.value);
    url = data["@odata.nextLink"];
  }
  return items;
}

// ---------------------------------------------------------------------------
// Graph types (minimal — only what we consume)
// ---------------------------------------------------------------------------

interface GraphTeam {
  id: string;
  displayName: string;
}

interface GraphChannel {
  id: string;
  displayName: string;
}

interface GraphMessage {
  id: string;
  createdDateTime: string;
  importance: string;
  from?: { user?: { displayName?: string; email?: string } };
  body?: { contentType: string; content: string };
  attachments?: { id: string; name: string; contentType: string; contentUrl: string }[];
  hasAttachments?: boolean;
}

interface GraphChat {
  id: string;
  topic: string | null;
  chatType: string; // "oneOnOne" | "group" | "meeting"
}

// ---------------------------------------------------------------------------
// Discovery: list teams and channels the connected user belongs to
// ---------------------------------------------------------------------------

export async function discoverTeamsAndChannels(): Promise<
  { teamId: string; teamName: string; channelId: string; channelName: string }[]
> {
  const token = await getValidAccessToken("microsoft", MS_ACCOUNT);
  const teams = await graphListAll<GraphTeam>("/me/joinedTeams", token);
  const results: { teamId: string; teamName: string; channelId: string; channelName: string }[] = [];

  for (const team of teams) {
    const channels = await graphListAll<GraphChannel>(`/teams/${team.id}/channels`, token);
    for (const ch of channels) {
      results.push({
        teamId: team.id,
        teamName: team.displayName,
        channelId: ch.id,
        channelName: ch.displayName,
      });
    }
  }
  return results;
}

// Persist discovered channels so we know what to sync.
export async function upsertChannels(
  channels: { teamId: string; teamName: string; channelId: string; channelName: string }[],
): Promise<void> {
  for (const ch of channels) {
    await db.execute({
      sql: `INSERT INTO teams_channels (id, team_id, team_name, channel_name, created_at)
            VALUES (?, ?, ?, ?, now()::text)
            ON CONFLICT(id) DO UPDATE SET team_name = excluded.team_name, channel_name = excluded.channel_name`,
      args: [ch.channelId, ch.teamId, ch.teamName, ch.channelName],
    });
  }
}

// ---------------------------------------------------------------------------
// Message sync: pull new messages from watched channels
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function preview(html: string, max = 500): string {
  const plain = stripHtml(html);
  return plain.length > max ? plain.slice(0, max) + "..." : plain;
}

export async function syncChannelMessages(): Promise<{ synced: number; channels: number }> {
  const token = await getValidAccessToken("microsoft", MS_ACCOUNT);

  // Only sync watched channels.
  const channels = (
    await db.execute(`SELECT id, team_id FROM teams_channels WHERE watched = 1`)
  ).rows;

  let totalSynced = 0;

  for (const ch of channels) {
    const channelId = String(ch.id);
    const teamId = String(ch.team_id);
    const scope = `channel:${channelId}`;

    // Check for a delta link from previous sync.
    const stateRow = (
      await db.execute({ sql: `SELECT delta_link FROM teams_sync_state WHERE scope = ?`, args: [scope] })
    ).rows[0];

    // Graph delta for channel messages: /teams/{id}/channels/{id}/messages/delta
    // If we have a deltaLink, use it; otherwise pull the full set.
    let url: string;
    if (stateRow?.delta_link) {
      url = String(stateRow.delta_link);
    } else {
      url = `${GRAPH}/teams/${teamId}/channels/${channelId}/messages?$top=50`;
    }

    let newDeltaLink: string | undefined;
    let count = 0;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        // 403/404 on a channel = permission issue or deleted channel; skip, don't crash the whole sync.
        if (res.status === 403 || res.status === 404) break;
        throw new Error(`Graph channel messages ${res.status}: ${text}`);
      }
      const data = (await res.json()) as GraphList<GraphMessage>;

      for (const msg of data.value) {
        if (!msg.body?.content) continue; // system messages with no body
        await upsertMessage({
          id: msg.id,
          channelId,
          chatId: null,
          senderName: msg.from?.user?.displayName ?? null,
          senderEmail: msg.from?.user?.email ?? null,
          bodyPreview: preview(msg.body.content),
          bodyHtml: msg.body.content,
          sentAt: msg.createdDateTime,
          hasAttachments: msg.hasAttachments ?? false,
          importance: msg.importance,
          attachments: msg.attachments ?? [],
        });
        count++;
      }

      newDeltaLink = data["@odata.deltaLink"];
      url = data["@odata.nextLink"] ?? "";
    }

    // Persist the delta link for next sync.
    if (newDeltaLink) {
      await db.execute({
        sql: `INSERT INTO teams_sync_state (scope, delta_link, last_sync_at)
              VALUES (?, ?, now()::text)
              ON CONFLICT(scope) DO UPDATE SET delta_link = excluded.delta_link, last_sync_at = now()::text`,
        args: [scope, newDeltaLink],
      });
    }

    totalSynced += count;
  }

  return { synced: totalSynced, channels: channels.length };
}

// ---------------------------------------------------------------------------
// Chat sync: pull messages from 1:1 and group chats
// ---------------------------------------------------------------------------

export async function syncChatMessages(): Promise<{ synced: number; chats: number }> {
  const token = await getValidAccessToken("microsoft", MS_ACCOUNT);
  const chats = await graphListAll<GraphChat>("/me/chats?$top=50", token);

  let totalSynced = 0;

  for (const chat of chats) {
    const scope = `chat:${chat.id}`;
    const stateRow = (
      await db.execute({ sql: `SELECT delta_link FROM teams_sync_state WHERE scope = ?`, args: [scope] })
    ).rows[0];

    let url: string;
    if (stateRow?.delta_link) {
      url = String(stateRow.delta_link);
    } else {
      url = `${GRAPH}/me/chats/${chat.id}/messages?$top=50`;
    }

    let newDeltaLink: string | undefined;
    let count = 0;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) break;
        const text = await res.text();
        throw new Error(`Graph chat messages ${res.status}: ${text}`);
      }
      const data = (await res.json()) as GraphList<GraphMessage>;

      for (const msg of data.value) {
        if (!msg.body?.content) continue;
        await upsertMessage({
          id: msg.id,
          channelId: null,
          chatId: chat.id,
          senderName: msg.from?.user?.displayName ?? null,
          senderEmail: msg.from?.user?.email ?? null,
          bodyPreview: preview(msg.body.content),
          bodyHtml: msg.body.content,
          sentAt: msg.createdDateTime,
          hasAttachments: msg.hasAttachments ?? false,
          importance: msg.importance,
          attachments: msg.attachments ?? [],
        });
        count++;
      }

      newDeltaLink = data["@odata.deltaLink"];
      url = data["@odata.nextLink"] ?? "";
    }

    if (newDeltaLink) {
      await db.execute({
        sql: `INSERT INTO teams_sync_state (scope, delta_link, last_sync_at)
              VALUES (?, ?, now()::text)
              ON CONFLICT(scope) DO UPDATE SET delta_link = excluded.delta_link, last_sync_at = now()::text`,
        args: [scope, newDeltaLink],
      });
    }

    totalSynced += count;
  }

  return { synced: totalSynced, chats: chats.length };
}

// ---------------------------------------------------------------------------
// Message upsert + attachment storage
// ---------------------------------------------------------------------------

interface MessageInsert {
  id: string;
  channelId: string | null;
  chatId: string | null;
  senderName: string | null;
  senderEmail: string | null;
  bodyPreview: string;
  bodyHtml: string;
  sentAt: string;
  hasAttachments: boolean;
  importance: string;
  attachments: { id: string; name: string; contentType: string; contentUrl: string }[];
}

async function upsertMessage(msg: MessageInsert): Promise<void> {
  await db.execute({
    sql: `INSERT INTO teams_messages
            (id, channel_id, chat_id, sender_name, sender_email, body_preview, body_html,
             sent_at, has_attachments, importance, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()::text)
          ON CONFLICT(id) DO UPDATE SET
            body_preview = excluded.body_preview,
            body_html = excluded.body_html,
            has_attachments = excluded.has_attachments,
            importance = excluded.importance,
            synced_at = now()::text`,
    args: [
      msg.id, msg.channelId, msg.chatId, msg.senderName, msg.senderEmail,
      msg.bodyPreview, msg.bodyHtml, msg.sentAt, msg.hasAttachments ? 1 : 0, msg.importance,
    ],
  });

  for (const att of msg.attachments) {
    await db.execute({
      sql: `INSERT INTO teams_attachments (id, message_id, name, content_type, content_url)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [att.id, msg.id, att.name, att.contentType, att.contentUrl],
    });
  }
}

// ---------------------------------------------------------------------------
// Project matching: link messages to brain projects by keyword/channel name
// ---------------------------------------------------------------------------

export async function matchMessagesToProjects(): Promise<number> {
  // Load all project slugs and names for matching.
  const projects = (
    await db.execute(`SELECT id, name FROM projects`)
  ).rows;

  if (projects.length === 0) return 0;

  // Build a simple keyword map: project name words -> project id.
  // Only match unmatched messages.
  const unmatched = (
    await db.execute(
      `SELECT id, body_preview, channel_id FROM teams_messages WHERE project_id IS NULL ORDER BY sent_at DESC LIMIT 500`,
    )
  ).rows;

  let matched = 0;

  for (const msg of unmatched) {
    const text = String(msg.body_preview).toLowerCase();
    let bestMatch: { projectId: string; method: string } | null = null;

    for (const proj of projects) {
      const name = String(proj.name).toLowerCase();
      // Match on client last name (first word of project name, at least 4 chars to avoid false positives).
      const words = name.split(/[\s\-–]+/).filter((w) => w.length >= 4);
      for (const word of words) {
        if (text.includes(word)) {
          bestMatch = { projectId: String(proj.id), method: "keyword" };
          break;
        }
      }
      if (bestMatch) break;
    }

    if (bestMatch) {
      await db.execute({
        sql: `UPDATE teams_messages SET project_id = ?, match_method = ? WHERE id = ?`,
        args: [bestMatch.projectId, bestMatch.method, msg.id],
      });
      matched++;
    }
  }

  return matched;
}

// ---------------------------------------------------------------------------
// Query: get messages for a project or recent messages
// ---------------------------------------------------------------------------

export async function getMessagesForProject(
  projectId: string,
  limit = 20,
): Promise<
  { id: string; senderName: string; bodyPreview: string; sentAt: string; channelId: string | null }[]
> {
  const rows = (
    await db.execute({
      sql: `SELECT id, sender_name, body_preview, sent_at, channel_id
            FROM teams_messages WHERE project_id = ? ORDER BY sent_at DESC LIMIT ?`,
      args: [projectId, limit],
    })
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    senderName: String(r.sender_name ?? "Unknown"),
    bodyPreview: String(r.body_preview),
    sentAt: String(r.sent_at),
    channelId: r.channel_id === null ? null : String(r.channel_id),
  }));
}

export async function getRecentMessages(
  limit = 50,
): Promise<
  { id: string; senderName: string; bodyPreview: string; sentAt: string; projectId: string | null }[]
> {
  const rows = (
    await db.execute({
      sql: `SELECT id, sender_name, body_preview, sent_at, project_id
            FROM teams_messages ORDER BY sent_at DESC LIMIT ?`,
      args: [limit],
    })
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    senderName: String(r.sender_name ?? "Unknown"),
    bodyPreview: String(r.body_preview),
    sentAt: String(r.sent_at),
    projectId: r.project_id === null ? null : String(r.project_id),
  }));
}
