import { writeOverride, OverrideError } from "@/lib/overrides";
import { requireRole } from "@/lib/auth";

// Dismiss (or un-dismiss) a Live flag/priority. entity_id is the synthetic "pid:flag_type" key.
// Editor+ only; audit actor is the signed-in user.
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
    await writeOverride({
      entityType: "live_flag",
      entityId: data.key,
      field: "dismissed",
      value: data.undo ? "false" : "true",
      actor,
      label: data.label,
      action: data.undo ? "restore" : "dismiss",
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof OverrideError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
