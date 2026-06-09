import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Auth-gated download of an estimate's ORIGINAL file. The bytes live in the app's own private
// Postgres (estimate_files.content, BYTEA) — never on public storage. We check the session, read
// the row, and stream it. Client financial documents stay entirely inside the auth-protected DB.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const row = (
    await db.execute({
      sql: `SELECT ef.content, ef.filename
              FROM estimates e
              JOIN estimate_files ef ON ef.source_file = e.source_file
             WHERE e.id = ?`,
      args: [id],
    })
  ).rows[0];

  const content = row?.content as Buffer | undefined;
  if (!content) return NextResponse.json({ error: "no document on file for this estimate" }, { status: 404 });

  const name = String(row.filename ?? "estimate.xlsx").replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(content), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
