// Outlook Calendar sync — rides the Microsoft connection (Calendars.Read). Pulls the
// next 30 days of events from Graph's calendar view, matches them to projects by
// subject + location, and stores them app-side so project pages can show what's coming
// up — inspections, walk-throughs, pours. Read-only like every other pipe.
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/oauth";
import { matchProject } from "@/lib/match-project";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MS_ACCOUNT = process.env.MS_TENANT_ID ?? "common";
const WINDOW_DAYS = 30;

interface GraphEvent {
  id: string;
  subject: string;
  isAllDay: boolean;
  webLink: string;
  start: { dateTime: string };
  end: { dateTime: string };
  location?: { displayName?: string };
}

async function ensureEvents() {
  await db.execute(`CREATE TABLE IF NOT EXISTS calendar_events (
    event_id TEXT PRIMARY KEY,
    subject TEXT,
    location TEXT,
    web_link TEXT,
    start_at TEXT,
    end_at TEXT,
    is_all_day BOOLEAN DEFAULT FALSE,
    project_id TEXT,
    synced_at TEXT
  )`);
}

export interface CalendarSyncResult {
  events: number;
  matched: number;
}

export async function syncCalendar(): Promise<CalendarSyncResult> {
  const token = await getValidAccessToken("microsoft", MS_ACCOUNT);
  await ensureEvents();

  const projects = (await db.execute("SELECT id, name FROM projects")).rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  const start = new Date();
  const end = new Date(start.getTime() + WINDOW_DAYS * 24 * 3600 * 1000);
  let url =
    `${GRAPH}/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}` +
    `&$select=id,subject,isAllDay,webLink,start,end,location&$orderby=start/dateTime&$top=100`;

  // replace the whole window each sync — events move and get cancelled
  await db.execute("DELETE FROM calendar_events");

  let events = 0, matched = 0;
  const now = new Date().toISOString();
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      if (res.status === 403) throw new Error("Calendar permission missing — hit Reconnect on the Microsoft row to grant it.");
      throw new Error(`Graph calendar failed: ${res.status} ${detail}`);
    }
    const data = (await res.json()) as { value: GraphEvent[]; "@odata.nextLink"?: string };
    for (const ev of data.value) {
      const loc = ev.location?.displayName ?? "";
      const m = matchProject(projects, `${ev.subject} ${loc}`);
      if (m) matched++;
      events++;
      await db.execute({
        sql: `INSERT INTO calendar_events (event_id, subject, location, web_link, start_at, end_at, is_all_day, project_id, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(event_id) DO UPDATE SET
                subject = excluded.subject, location = excluded.location, web_link = excluded.web_link,
                start_at = excluded.start_at, end_at = excluded.end_at, is_all_day = excluded.is_all_day,
                project_id = excluded.project_id, synced_at = excluded.synced_at`,
        args: [ev.id, ev.subject ?? "", loc, ev.webLink ?? "", ev.start?.dateTime ?? "", ev.end?.dateTime ?? "", ev.isAllDay ?? false, m?.id ?? null, now],
      });
    }
    url = data["@odata.nextLink"] ?? "";
  }
  return { events, matched };
}

export interface CalendarEventRow {
  subject: string;
  location: string;
  webLink: string;
  startAt: string;
  isAllDay: boolean;
}

export async function eventsForProject(projectId: string): Promise<CalendarEventRow[]> {
  await ensureEvents();
  const rows = (
    await db.execute({
      sql: `SELECT subject, location, web_link, start_at, is_all_day FROM calendar_events
            WHERE project_id = ? ORDER BY start_at LIMIT 10`,
      args: [projectId],
    })
  ).rows;
  return rows.map((r) => ({
    subject: String(r.subject ?? ""),
    location: String(r.location ?? ""),
    webLink: String(r.web_link ?? ""),
    startAt: String(r.start_at ?? ""),
    isAllDay: Boolean(r.is_all_day),
  }));
}
