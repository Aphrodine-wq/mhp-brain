import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createPayment, getPayments, getPaymentSummary } from "@/lib/operations";
import { notifyProject } from "@/lib/alerts";
import { money } from "@/lib/format";

// GET /api/jobs/payments?project=<id>         — all payments for a project
// GET /api/jobs/payments?project=<id>&summary — just the summary (total collected, count)
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("project");
  if (!projectId) return NextResponse.json({ error: "project required" }, { status: 400 });

  if (sp.has("summary")) {
    const summary = await getPaymentSummary(projectId);
    return NextResponse.json({ summary });
  }
  const rows = await getPayments(projectId);
  return NextResponse.json({ payments: rows });
}

// POST /api/jobs/payments — record a payment
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || body.amount == null || !body.payment_date) {
    return NextResponse.json({ error: "project_id, amount, payment_date required" }, { status: 400 });
  }
  const id = await createPayment({ ...body, recorded_by: user.name });
  notifyProject("payment_received", body.project_id, (project) => ({
    title: "Payment received",
    facts: [
      { name: "Project", value: project.slice(0, 120) },
      { name: "Amount", value: money(Number(body.amount) || 0) },
      { name: "Recorded by", value: user.name },
    ],
  }));
  return NextResponse.json({ ok: true, id });
}
