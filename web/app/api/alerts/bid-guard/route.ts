import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendAlert } from "@/lib/alerts";
import { money } from "@/lib/format";
import { getSetting } from "@/lib/integration-settings";

// POST /api/alerts/bid-guard — fired when someone clicks through the Bid Guard exit gate
// on an under-baseline estimate. Per MARGIN_GUARD.md this is allowed (loyalty pricing is
// deliberate) but never silent: the channel hears about every override, with the dollars.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let d;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const totalShort = Number(d.totalShort) || 0;
  const markup = Number(d.markup) || 0;
  const bid = Number(d.bid) || 0;
  if ((await getSetting("alerts", "bid_guard", "on")) !== "on") return NextResponse.json({ ok: true, muted: true });
  await sendAlert({
    title: "Bid Guard override — estimate sent under baseline",
    urgent: true,
    lines: [`${user.name} chose "${String(d.action ?? "continue")} anyway" on an estimate priced to lose money.`],
    facts: [
      { name: "Project", value: String(d.project ?? "—").slice(0, 120) || "—" },
      { name: "Under baseline", value: totalShort > 0 ? money(totalShort) : "—" },
      { name: "Markup", value: `${markup}%` },
      { name: "Bid", value: money(bid) },
    ],
  });
  return NextResponse.json({ ok: true });
}
