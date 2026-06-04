import { writeOverride, OverrideError } from "@/lib/overrides";
import { requireRole } from "@/lib/auth";

// Set a project's status. Editor+ only; audit actor is the signed-in user.
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 403 });
  let data;
  try {
    data = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const actor = user.name.slice(0, 60);
  try {
    await writeOverride({ entityType: "project", entityId: data.id, field: "status", value: data.status, actor, label: data.name, action: "set" });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof OverrideError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
