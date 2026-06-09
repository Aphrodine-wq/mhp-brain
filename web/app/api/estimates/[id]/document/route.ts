import { type NextRequest, NextResponse } from "next/server";
import { basename } from "node:path";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Auth-gated download of an estimate's ORIGINAL file. The Vercel Blob URL is stored server-side and
// never sent to the browser; this route checks the session, fetches the blob server-to-server, and
// streams it back — so client financial documents stay behind login, not on a guessable public URL.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const row = (
    await db.execute({ sql: `SELECT source_url, source_file FROM estimates WHERE id = ?`, args: [id] })
  ).rows[0];
  const url = row?.source_url ? String(row.source_url) : null;
  if (!url) return NextResponse.json({ error: "no document on file for this estimate" }, { status: 404 });

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "could not retrieve the document" }, { status: 502 });
  }

  const name = basename(String(row.source_file ?? "estimate.xlsx")).replace(/["\r\n]/g, "");
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
