import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { setSetting } from "@/lib/integration-settings";

// POST {provider, key, value} — admin-only knob turning.
export async function POST(req: Request) {
  if (!(await requireRole("ceo"))) return NextResponse.json({ error: "admin session required" }, { status: 401 });
  let d;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const provider = String(d.provider ?? "").slice(0, 40);
  const key = String(d.key ?? "").slice(0, 60);
  if (!provider || !key) return NextResponse.json({ error: "missing provider/key" }, { status: 400 });
  await setSetting(provider, key, String(d.value ?? ""));
  return NextResponse.json({ ok: true });
}
