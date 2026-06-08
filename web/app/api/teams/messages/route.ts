import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getMessagesForProject, getRecentMessages } from "@/lib/teams";

// GET /api/teams/messages?project=<id>&limit=<n>  — messages for a project
// GET /api/teams/messages?limit=<n>                — recent messages across all projects
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("project");
  const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10) || 20, 100);

  if (projectId) {
    const messages = await getMessagesForProject(projectId, limit);
    return NextResponse.json({ messages });
  }

  const messages = await getRecentMessages(limit);
  return NextResponse.json({ messages });
}
