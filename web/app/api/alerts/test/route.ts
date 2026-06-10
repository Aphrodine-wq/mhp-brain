import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendAlert, alertsConfigured } from "@/lib/alerts";

// POST /api/alerts/test — fire a test card at the channel so wiring can be verified.
export async function POST() {
  const user = await requireRole("ceo");
  if (!user) return NextResponse.json({ error: "admin session required" }, { status: 401 });
  if (!alertsConfigured()) return NextResponse.json({ error: "TEAMS_WEBHOOK_URL is not set" }, { status: 400 });
  const ok = await sendAlert({
    title: "MHP Brain — test alert",
    lines: [`Wiring works. Sent by ${user.name}.`],
  });
  return NextResponse.json(ok ? { ok: true } : { error: "webhook rejected the message" }, { status: ok ? 200 : 502 });
}
