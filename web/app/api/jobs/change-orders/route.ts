import { type NextRequest, NextResponse } from "next/server";
import { currentUser, requireRole } from "@/lib/auth";
import { createChangeOrder, getChangeOrders, approveChangeOrder, billChangeOrder, OpsError } from "@/lib/operations";
import { notifyProject } from "@/lib/alerts";
import { money } from "@/lib/format";
import { db } from "@/lib/db";

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
  notifyProject("change_order_new", body.project_id, (project) => ({
    title: "Change order submitted",
    facts: [
      { name: "Project", value: project.slice(0, 120) },
      { name: "Amount", value: money(Number(body.amount) || 0) },
      { name: "Description", value: String(body.description).slice(0, 160) },
    ],
  }));
  return NextResponse.json({ ok: true, id });
}

// PATCH /api/jobs/change-orders — approve/reject or mark billed
export async function PATCH(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.approved != null && body.approved !== 1 && body.approved !== -1) {
    return NextResponse.json({ error: "approved must be 1 or -1" }, { status: 400 });
  }
  try {
    if (body.approved != null) await approveChangeOrder(body.id, body.approved, user.name);
    if (body.billed) await billChangeOrder(body.id, user.name);
  } catch (e) {
    if (e instanceof OpsError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  // decided (approved/rejected) — PATCH only carries the CO id, so look up its job + amount for the card
  if (body.approved != null) {
    const co = (await db.execute({ sql: "SELECT project_id, amount FROM change_orders WHERE id = ? LIMIT 1", args: [body.id] })).rows[0];
    if (co?.project_id) notifyProject("change_order_decided", String(co.project_id), (project) => ({
      title: body.approved === 1 ? "Change order approved" : "Change order rejected",
      facts: [
        { name: "Project", value: project.slice(0, 120) },
        { name: "Amount", value: money(Number(co.amount) || 0) },
        { name: "By", value: user.name },
      ],
    }));
  }
  return NextResponse.json({ ok: true });
}
