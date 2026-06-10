import { type NextRequest, NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/auth";
import { getDocument, deleteDocument } from "@/lib/documents-store";

// Auth-gated download — same posture as estimate originals: private DB, session required.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(doc.content), {
    status: 200,
    headers: {
      "Content-Type": doc.meta.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.meta.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireRole("admin"))) return NextResponse.json({ error: "admin role required" }, { status: 403 });
  const { id } = await params;
  const ok = await deleteDocument(id);
  return NextResponse.json(ok ? { ok: true } : { error: "not found" }, { status: ok ? 200 : 404 });
}
