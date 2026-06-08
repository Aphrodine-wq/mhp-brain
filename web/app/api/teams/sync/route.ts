import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncChannelMessages, syncChatMessages, matchMessagesToProjects } from "@/lib/teams";

// POST /api/teams/sync — pull new messages from Teams channels + chats, then match to projects.
// Idempotent: uses delta links so repeated calls only pull new messages.
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "admin session required" }, { status: 401 });
  }

  try {
    const [channelResult, chatResult] = await Promise.all([
      syncChannelMessages(),
      syncChatMessages(),
    ]);
    const matched = await matchMessagesToProjects();

    return NextResponse.json({
      ok: true,
      channels: { synced: channelResult.synced, watched: channelResult.channels },
      chats: { synced: chatResult.synced, total: chatResult.chats },
      matched,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
