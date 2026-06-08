import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { discoverTeamsAndChannels, upsertChannels } from "@/lib/teams";

// GET /api/teams/discover — list all teams+channels the connected user belongs to, persist them.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }

  try {
    const channels = await discoverTeamsAndChannels();
    await upsertChannels(channels);
    return NextResponse.json({ ok: true, channels });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
