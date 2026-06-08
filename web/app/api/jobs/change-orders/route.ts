import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createChangeOrder, getChangeOrders, approveChangeOrder, billChangeOrder } from "@/lib/operations";

// GET /api/jobs/change-orders?project=<id>
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("project");
  if (!projectId) return NextResponse.json({ error: "project required" }, { status: 400 });
  const rows = await getChangeOrders(projectId);
  return NextResponse.json({ change_orders: rows });
}

// POST /api/jobs/change-orders — create a new change order
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.project_id || !body.description || body.amount == null) {
    return NextResponse.json({ error: "project_id, description, amount required" }, { status: 400 });
  }
  const id = await createChangeOrder({ ...body, created_by: user.name });
  return NextResponse.json({ ok: true, id });
}

// PATCH /api/jobs/change-orders — approve/reject or mark billed
export async function PATCH(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.approved != null) await approveChangeOrder(body.id, body.approved);
  if (body.billed) await billChangeOrder(body.id);
  return NextResponse.json({ ok: true });
}
