import { requireUser, requireRole } from "@/lib/auth";
import { listDocuments, saveDocument, DOC_CATEGORIES, MAX_DOC_BYTES } from "@/lib/documents-store";

// List document metadata, optionally scoped to one entity (?entityType=sub&entityId=<key>).
export async function GET(req: Request) {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  return Response.json(await listDocuments(entityType ? { entityType, entityId } : undefined));
}

// Upload a document (multipart form: file, category, entityType?, entityId?, entityLabel?).
export async function POST(req: Request) {
  const user = await requireRole("editor");
  if (!user) return Response.json({ error: "editor role required" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "missing file" }, { status: 400 });
  if (file.size > MAX_DOC_BYTES) return Response.json({ error: "file too large (15MB max)" }, { status: 413 });

  const category = String(form.get("category") ?? "Other");
  if (!(DOC_CATEGORIES as readonly string[]).includes(category)) {
    return Response.json({ error: "unknown category" }, { status: 400 });
  }

  const id = await saveDocument({
    category,
    entityType: form.get("entityType") ? String(form.get("entityType")) : null,
    entityId: form.get("entityId") ? String(form.get("entityId")) : null,
    entityLabel: form.get("entityLabel") ? String(form.get("entityLabel")) : null,
    filename: file.name.replace(/["\r\n]/g, "").slice(0, 200) || "document",
    mime: file.type || null,
    content: Buffer.from(await file.arrayBuffer()),
    uploadedBy: user.name.slice(0, 60),
  });
  return Response.json({ ok: true, id });
}
