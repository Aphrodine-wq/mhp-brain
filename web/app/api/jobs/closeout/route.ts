import { type NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { recordActual, OpsError } from "@/lib/operations";

// POST /api/jobs/closeout — record (or clear) what a job actually closed at.
//
// This is the only way into `actuals` other than the pipeline's spreadsheet parser, and it is
// what lets the flywheel's training set grow past the four jobs that happened to ship with a
// parseable closeout document. Editor-gated and audited like every other mutation.
export async function POST(req: NextRequest) {
  const user = await requireRole("editor");
  if (!user) return NextResponse.json({ error: "editor role required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const projectId = String(body.project_id ?? "").trim();
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  try {
    await recordActual(
      {
        projectId,
        closingTotal: body.closing_total === "" || body.closing_total == null ? null : Number(body.closing_total),
        note: body.note ?? null,
      },
      user.name,
    );
  } catch (e) {
    if (e instanceof OpsError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
