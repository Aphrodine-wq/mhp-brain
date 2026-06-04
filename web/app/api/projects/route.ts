import { requireUser } from "@/lib/auth";
import { projectsList } from "@/lib/queries";

export async function GET() {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await projectsList());
}
