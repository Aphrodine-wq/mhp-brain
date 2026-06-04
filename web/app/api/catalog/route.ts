import { requireUser } from "@/lib/auth";
import { catalogList } from "@/lib/queries";

export async function GET() {
  if (!(await requireUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await catalogList());
}
