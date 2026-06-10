import { requireUser, requireRole } from "@/lib/auth";
import { crewList } from "@/lib/queries";
import { writeOverride, OverrideError, subKey } from "@/lib/overrides";

export async function GET() {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await crewList());
}

const FIELDS = ["role", "rate", "phone", "email", "hire_date", "address", "emergency_contact", "certifications", "notes"] as const;

// Update a crew member's profile (overrides overlay, audited). Editor+ only.
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 403 });
  let data;
  try {
    data = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!data.name) return Response.json({ error: "missing name" }, { status: 400 });
  const actor = user.name.slice(0, 60);
  const key = subKey(String(data.name));
  try {
    for (const field of FIELDS) {
      if (field in data) {
        await writeOverride({
          entityType: "crew",
          entityId: key,
          field,
          value: String(data[field]),
          actor,
          label: data.name,
          action: "set",
        });
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof OverrideError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
