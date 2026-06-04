import { writeOverride, OverrideError } from "@/lib/overrides";

// Correct a project's market or type (one field per call).
export async function POST(req: Request) {
  if (req.headers.get("x-mhp-write") !== "1") return Response.json({ error: "forbidden" }, { status: 403 });
  let data;
  try {
    data = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const actor = String(data.actor || "Walt Burge").slice(0, 60);
  if (data.field !== "market" && data.field !== "type") return Response.json({ error: "bad field" }, { status: 400 });
  try {
    await writeOverride({ entityType: "project", entityId: data.id, field: data.field, value: data.value, actor, label: data.name, action: "set" });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof OverrideError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
