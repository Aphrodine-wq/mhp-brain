import { requireUser, requireRole } from "@/lib/auth";
import { subsList } from "@/lib/queries";
import { db } from "@/lib/db";

export async function GET() {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await subsList());
}

// Add a sub to the roster (Add Sub modal / contacts import). Editor+ only.
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 403 });
  let data;
  try {
    data = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const name = String(data.name ?? "").trim().slice(0, 120);
  if (!name) return Response.json({ error: "missing name" }, { status: 400 });
  const trade = String(data.trade ?? "").trim().slice(0, 120);
  const phone = String(data.phone ?? "").trim().slice(0, 40);
  const source = data.source === "contacts" ? "Contacts import" : `Added by ${user.name.slice(0, 60)}`;

  const dup = await db.execute({
    sql: "SELECT 1 FROM subs WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1",
    args: [name],
  });
  if (dup.rows.length) return Response.json({ error: "already on the roster" }, { status: 409 });

  await db.execute({
    sql: "INSERT INTO subs (name, trade, phone, jobs, projects, source) VALUES (?, ?, ?, 0, '', ?)",
    args: [name, trade, phone, source],
  });
  return Response.json({ ok: true });
}
