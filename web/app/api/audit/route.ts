import { requireUser } from "@/lib/auth";
import { auditList } from "@/lib/overrides";

export async function GET() {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await auditList());
}
