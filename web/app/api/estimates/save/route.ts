import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendAlert } from "@/lib/alerts";
import { money } from "@/lib/format";
import { getSetting } from "@/lib/integration-settings";

function slugify(s: string): string {
  return (s || "estimate").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "estimate";
}

// Save the working estimate as a project record (app-owned saved_estimates table).
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const d = await req.json();
  const now = new Date().toISOString();
  const id = `${slugify(d.project)}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db.execute({
      sql: `INSERT INTO saved_estimates
              (id, project, client_name, address, est_date, status, markup, total, lines, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
      args: [
        id,
        d.project || "Untitled Project",
        d.clientName || null,
        d.address || null,
        d.estDate || null,
        d.status || "draft",
        Number(d.markup) || 18,
        Number(d.total) || 0,
        JSON.stringify(d.lines ?? []),
        user.email,
        now,
        now,
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // most likely cause before the migration runs: relation "saved_estimates" does not exist
    return Response.json({ error: "save failed", detail: msg }, { status: 500 });
  }
  // FYI to the channel — saves are rare and meaningful. Fire-and-forget by design.
  if ((await getSetting("alerts", "estimate_saved", "on")) === "on") void sendAlert({
    title: "New estimate saved",
    facts: [
      { name: "Project", value: String(d.project || "Untitled Project").slice(0, 120) },
      { name: "Bid", value: money(Number(d.total) || 0) },
      { name: "Markup", value: `${Number(d.markup) || 18}%` },
      { name: "By", value: user.email },
    ],
  });
  return Response.json({ id });
}
