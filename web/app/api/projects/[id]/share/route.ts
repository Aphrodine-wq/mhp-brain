import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createShareLink, revokeShareLink } from "@/lib/share";

// POST   — mint (or regenerate) a client portal link for this job; returns the path.
// DELETE — revoke the active link. Editor-gated, like the other job mutations.

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const { id } = await params;
  const raw = await createShareLink(id, user.name);
  return NextResponse.json({ ok: true, path: `/c/${raw}` });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const { id } = await params;
  await revokeShareLink(id, user.name);
  return NextResponse.json({ ok: true });
}
