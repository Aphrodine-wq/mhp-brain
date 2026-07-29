import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createInvoice, getInvoices, getInvoiceTotal } from "@/lib/operations";

// GET /api/jobs/invoices?project=<id>          — all invoices for a project
// GET /api/jobs/invoices?project=<id>&summary  — just the total + count
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("project");
  if (!projectId) return NextResponse.json({ error: "project required" }, { status: 400 });

  if (sp.has("summary")) {
    const summary = await getInvoiceTotal(projectId);
    return NextResponse.json({ summary });
  }
  const rows = await getInvoices(projectId);
  return NextResponse.json({ invoices: rows });
}

// POST /api/jobs/invoices — record a vendor invoice against a project
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || !body.vendor?.trim() || body.amount == null || !body.invoice_date) {
    return NextResponse.json({ error: "project_id, vendor, amount, invoice_date required" }, { status: 400 });
  }
  const id = await createInvoice({ ...body, created_by: user.name });
  return NextResponse.json({ ok: true, id });
}
