import { writeOverride, OverrideError, subKey } from "@/lib/overrides";

// Confirm a sub (verified) and/or correct its trade/phone. Keyed by normalized name.
export async function POST(req: Request) {
  if (req.headers.get("x-mhp-write") !== "1") return Response.json({ error: "forbidden" }, { status: 403 });
  let data;
  try {
    data = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!data.name) return Response.json({ error: "missing name" }, { status: 400 });
  const actor = String(data.actor || "Walt Burge").slice(0, 60);
  const key = subKey(String(data.name));
  try {
    for (const field of ["trade", "phone", "verified"] as const) {
      if (field in data) {
        await writeOverride({
          entityType: "sub",
          entityId: key,
          field,
          value: String(data[field]),
          actor,
          label: data.name,
          action: field === "verified" ? "confirm" : "set",
        });
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof OverrideError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
