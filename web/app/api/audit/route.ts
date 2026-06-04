import { auditList } from "@/lib/overrides";

export async function GET() {
  return Response.json(await auditList());
}
