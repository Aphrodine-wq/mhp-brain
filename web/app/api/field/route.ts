import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { createJobEvent, type JobEventInsert } from "@/lib/operations";
import { createChangeOrder } from "@/lib/operations";
import { createPayment } from "@/lib/operations";

// POST /api/field — simplified field entry endpoint.
// Accepts a minimal payload and routes to the right table(s).
// Designed for the mobile field form — one POST does everything.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const body = await req.json();
  const { project_id, event_type, summary, amount } = body;

  if (!project_id || !event_type || !summary) {
    return NextResponse.json(
      { error: "project_id, event_type, and summary are required" },
      { status: 400 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: string[] = [];

  // Always create a job event (the activity log)
  const eventData: JobEventInsert = {
    project_id,
    event_type,
    event_date: body.event_date || today,
    summary,
    detail: body.detail,
    crew_present: body.crew_present,
    hours_worked: body.hours_worked,
    weather: body.weather,
    action_items: body.action_items,
    logged_by: user.name,
  };
  await createJobEvent(eventData);
  results.push("event logged");

  // If it's a change order with an amount, also create the CO
  if (event_type === "change_order" && amount) {
    await createChangeOrder({
      project_id,
      description: summary,
      amount: parseFloat(amount),
      created_by: user.name,
    });
    results.push("change order created");
  }

  // If it's a payment with an amount, also create the payment
  if (event_type === "payment" && amount) {
    await createPayment({
      project_id,
      amount: parseFloat(amount),
      payment_date: today,
      notes: summary,
      recorded_by: user.name,
    });
    results.push("payment recorded");
  }

  return NextResponse.json({ ok: true, results });
}
