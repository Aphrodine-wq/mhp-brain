import { NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/auth";
import { listMaterials, upsertMaterial, removeMaterial, setMarketPrice } from "@/lib/price-sensor";

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listMaterials());
}

// Create/update a tracked material, or set its market price ({id, marketPrice, source}).
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 403 });
  let d;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (d.marketPrice != null && d.id) {
    const price = Number(d.marketPrice);
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "bad price" }, { status: 400 });
    await setMarketPrice(String(d.id), price, `manual — ${user.name.slice(0, 40)}`);
    return NextResponse.json({ ok: true });
  }
  const name = String(d.name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const id = await upsertMaterial({
    id: d.id ? String(d.id) : undefined,
    name,
    unit: String(d.unit ?? "").slice(0, 40),
    catalogDesc: String(d.catalogDesc ?? "").slice(0, 160),
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  if (!(await requireRole("editor"))) return NextResponse.json({ error: "editor role required" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await removeMaterial(id);
  return NextResponse.json({ ok: true });
}
